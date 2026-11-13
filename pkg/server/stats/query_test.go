package stats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// spyStore records every request passed to List, and the players whose decks
// the last one returned, so tests can check which decks a handler read.
type spyStore struct {
	storage.DeckStorage
	mu          sync.Mutex
	requests    []storage.DecksRequest
	lastPlayers []string
}

func (s *spyStore) List(cube string, req *storage.DecksRequest) ([]*storage.Deck, error) {
	decks, err := s.DeckStorage.List(cube, req)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.requests = append(s.requests, *req)
	s.lastPlayers = nil
	for _, d := range decks {
		s.lastPlayers = append(s.lastPlayers, d.Player)
	}
	return decks, err
}

// stubCubes serves one small cube for every cube id.
type stubCubes struct{}

func (stubCubes) Current(string) (*types.Cube, error) {
	return stubCube(), nil
}

func (stubCubes) Refresh(string) (*types.Cube, error) {
	return stubCube(), nil
}

func stubCube() *types.Cube {
	return &types.Cube{Cards: []types.Card{
		{Name: "gy1", OracleText: "Return a card from your graveyard."},
		{Name: "gy2", OracleText: "Return a card from your graveyard."},
		{Name: "gy3", OracleText: "Return a card from your graveyard."},
		{Name: "Grizzly Bears", Types: []string{"Creature"}, Power: "2", Toughness: "2", CMC: 2},
	}}
}

// graveyardPackages wires three graveyard cards to each other, so a deck
// holding all three builds the package and a deck holding two doesn't.
func graveyardPackages(string) ([]design.PackageCards, error) {
	return []design.PackageCards{{
		Name: "Graveyard",
		Wires: []design.WireCards{{
			Sources: map[string]bool{
				"gy1": true,
				"gy2": true,
				"gy3": true,
			},
			Targets: map[string]bool{
				"gy1": true,
				"gy2": true,
				"gy3": true,
			},
			NeedSources: 2,
			NeedTargets: 2,
		}},
	}}, nil
}

func queryDeck(playerID int, date string, names ...string) *storage.Deck {
	d := &storage.Deck{}
	d.PlayerID = playerID
	d.Metadata.DraftID = 1
	d.Date = date
	for _, n := range names {
		d.Mainboard = append(d.Mainboard, types.Card{Name: n})
	}
	return d
}

// newSpy wraps a memory store holding Ozzy's graveyard deck from January and
// Stevie's from August, with empty design rules so graph builds succeed.
func newSpy() *spyStore {
	return &spyStore{DeckStorage: memory.NewStore(func(b *memory.Backend) {
		b.SeedPlayers(players.Player{ID: 1, Name: "Ozzy"}, players.Player{ID: 2, Name: "Stevie"})
		b.Seed("testcube", queryDeck(1, "2026-01-10", "gy1", "gy2", "gy3", "Grizzly Bears"), queryDeck(2, "2026-08-01", "gy1", "gy2", "Grizzly Bears"))
		b.SeedRules("testcube", &design.DesignMapConfig{
			Groups:   []design.Group{{Name: "Graveyard", Conditions: []string{"o:graveyard"}}},
			Packages: []design.Package{{Name: "Graveyard", Wires: []design.Wire{{Sources: []string{"Graveyard"}, Targets: []string{"Graveyard"}}}}},
		})
	})}
}

func serve(t *testing.T, h http.Handler, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req = req.WithContext(server.ContextWithCube(context.Background(), "testcube"))
	req.SetPathValue("cube", "testcube")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// TestFilteredHandlersMatchDecksPage builds each filtered stats handler through
// its public constructor, so the real packages answer the package term,
// and checks it reads the same decks as the Decks endpoint.
func TestFilteredHandlersMatchDecksPage(t *testing.T) {
	const target = "?match=package:graveyard"
	decksSpy := newSpy()
	rec := serve(t, decks.DeckHandler(decksSpy, stubCubes{}), http.MethodGet, "/api/testcube/decks"+target, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, []string{"Ozzy"}, decksSpy.lastPlayers)

	for name, build := range map[string]func(storage.DeckStorage, types.CubeSource) http.Handler{
		"cards":          CardStatsHandler,
		"colors":         ColorStatsHandler,
		"archetypes":     ArchetypeStatsHandler,
		"players":        PlayerStatsHandler,
		"color-matchups": ColorMatchupHandler,
		"packages":       PackageStatsHandler,
	} {
		t.Run(name, func(t *testing.T) {
			spy := newSpy()
			rec := serve(t, build(spy, stubCubes{}), http.MethodGet, "/api/testcube/stats/"+name+target, "")
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			assert.Equal(t, decksSpy.lastPlayers, spy.lastPlayers)
		})
	}

	// Pivot reads its subject decks last, after the whole date range it finds
	// opponents in.
	t.Run("pivot", func(t *testing.T) {
		spy := newSpy()
		body := `{"match":"package:graveyard","group_by":{"dim":"player"}}`
		rec := serve(t, PivotHandler(spy, stubCubes{}), http.MethodPost, "/api/testcube/stats/pivot", body)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		assert.Equal(t, decksSpy.lastPlayers, spy.lastPlayers)
	})
}

// populationCase is one handler request and the deck population it should
// ask the store for.
type populationCase struct {
	name    string
	handler func(storage.DeckStorage) http.Handler
	method  string
	target  string
	body    string
	want    storage.DecksRequest
}

func TestWholePopulationHandlersKeepPopulation(t *testing.T) {
	const filters = "player=Ozzy&match=arch:aggro&size=99&board=Sideboard"
	const dates = "&start=2026-01-01&end=2026-06-30"
	dateRange := storage.DecksRequest{Start: "2026-01-01", End: "2026-06-30"}
	for _, tc := range []populationCase{
		{"removal", func(s storage.DeckStorage) http.Handler { return RemovalHandler(s, stubCubes{}) }, http.MethodGet, "/stats/removal?" + filters, "", storage.DecksRequest{}},
		{"removal with dates", func(s storage.DeckStorage) http.Handler { return RemovalHandler(s, stubCubes{}) }, http.MethodGet, "/stats/removal?" + filters + dates, "", dateRange},
		{"group distributions", func(s storage.DeckStorage) http.Handler { return GroupDistributionsHandler(s, stubCubes{}) }, http.MethodGet, "/stats/group-distributions?" + filters + dates, "", storage.DecksRequest{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			spy := newSpy()
			rec := serve(t, tc.handler(spy), tc.method, "/api/testcube"+tc.target, tc.body)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

			// The design graph's card-name pass always reads every deck, so
			// a request is either that or the handler's own population.
			assert.Contains(t, spy.requests, tc.want)
			for _, got := range spy.requests {
				assert.Contains(t, []storage.DecksRequest{{}, tc.want}, got)
			}
		})
	}
}

// TestDeckFilterHandlersReadOnlyTheFilter checks that packages and pivot take
// the deck filter from the page and nothing else, and that pivot still reads the
// whole date range for opponents.
func TestDeckFilterHandlersReadOnlyTheFilter(t *testing.T) {
	const filters = "player=Ozzy&match=arch:aggro&size=99&board=Sideboard"
	const dates = "&start=2026-01-01&end=2026-06-30"
	dateRange := storage.DecksRequest{Start: "2026-01-01", End: "2026-06-30"}
	filtered := storage.DecksRequest{Start: "2026-01-01", End: "2026-06-30", Match: "arch:aggro"}

	t.Run("packages", func(t *testing.T) {
		spy := newSpy()
		rec := serve(t, PackageStatsHandler(spy, stubCubes{}), http.MethodGet, "/api/testcube/stats/packages?"+filters+dates, "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		// The design graph's card-name pass always reads every deck.
		assert.Contains(t, spy.requests, filtered)
		for _, got := range spy.requests {
			assert.Contains(t, []storage.DecksRequest{{}, filtered}, got)
		}
	})

	t.Run("pivot with a filter", func(t *testing.T) {
		spy := newSpy()
		body := `{"start":"2026-01-01","end":"2026-06-30","match":"arch:aggro"}`
		rec := serve(t, PivotHandler(spy, stubCubes{}), http.MethodPost, "/api/testcube/stats/pivot?"+filters, body)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		assert.Equal(t, []storage.DecksRequest{dateRange, filtered}, spy.requests)
	})

	t.Run("pivot without a filter", func(t *testing.T) {
		spy := newSpy()
		body := `{"start":"2026-01-01","end":"2026-06-30"}`
		rec := serve(t, PivotHandler(spy, stubCubes{}), http.MethodPost, "/api/testcube/stats/pivot?"+filters, body)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		assert.Equal(t, []storage.DecksRequest{dateRange}, spy.requests)
	})
}

func TestRemovalDateRangeWeights(t *testing.T) {
	for query, want := range map[string]int{
		"":                                 2,
		"?start=2026-01-01&end=2026-06-30": 1,
	} {
		rec := serve(t, RemovalHandler(newSpy(), stubCubes{}), http.MethodGet, "/api/testcube/stats/removal"+query, "")
		require.Equal(t, http.StatusOK, rec.Code)
		var resp RemovalResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		assert.Equal(t, want, resp.TotalPlayWeight, query)
	}
}
