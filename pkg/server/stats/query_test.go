package stats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// spyStore records every request passed to List, so tests can check which
// deck population a handler asked for.
type spyStore struct {
	storage.DeckStorage
	mu       sync.Mutex
	requests []storage.DecksRequest
}

func (s *spyStore) List(cube string, req *storage.DecksRequest) ([]*storage.Deck, error) {
	s.mu.Lock()
	s.requests = append(s.requests, *req)
	s.mu.Unlock()
	return s.DeckStorage.List(cube, req)
}

// stubCubes serves one small cube for every cube id.
type stubCubes struct{}

func (stubCubes) Current(string) (*types.Cube, error) { return stubCube(), nil }
func (stubCubes) Refresh(string) (*types.Cube, error) { return stubCube(), nil }

func stubCube() *types.Cube {
	return &types.Cube{Cards: []types.Card{
		{Name: "gy1"},
		{Name: "gy2"},
		{Name: "gy3"},
		{Name: "Grizzly Bears", Types: []string{"Creature"}, Power: "2", Toughness: "2", CMC: 2},
	}}
}

func graveyardEdges(string) ([]graph.Edge, error) {
	return []graph.Edge{
		{A: "gy1", B: "gy2", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "gy2", B: "gy3", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "gy1", B: "gy3", Weight: 5, Labels: []string{"Graveyard"}},
	}, nil
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
		b.Seed("testcube",
			queryDeck(1, "2026-01-10", "gy1", "gy2", "gy3", "Grizzly Bears"),
			queryDeck(2, "2026-08-01", "gy1", "gy2", "Grizzly Bears"),
		)
		b.SeedRules("testcube", &design.DesignMapConfig{})
	})}
}

func serve(t *testing.T, h http.Handler, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	req = req.WithContext(server.ContextWithCube(context.Background(), "testcube"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestFilteredHandlersAttachCommunityEdges(t *testing.T) {
	for name, build := range map[string]func(q *deckquery.Query) http.Handler{
		"cards":          func(q *deckquery.Query) http.Handler { return &cardStatsHandler{q: q} },
		"colors":         func(q *deckquery.Query) http.Handler { return &colorStatsHandler{q: q} },
		"synergy":        func(q *deckquery.Query) http.Handler { return &synergyStatsHandler{q: q} },
		"archetypes":     func(q *deckquery.Query) http.Handler { return &archetypeStatsHandler{q: q} },
		"players":        func(q *deckquery.Query) http.Handler { return &playerStatsHandler{q: q} },
		"color-matchups": func(q *deckquery.Query) http.Handler { return &colorMatchupHandler{q: q} },
		"health":         func(q *deckquery.Query) http.Handler { return &healthStatsHandler{q: q} },
	} {
		t.Run(name, func(t *testing.T) {
			spy := newSpy()
			h := build(deckquery.New(spy, stubCubes{}, graveyardEdges))

			rec := serve(t, h, http.MethodGet, "/api/testcube/stats/"+name+"?match=community:graveyard")
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			require.NotEmpty(t, spy.requests)
			assert.NotNil(t, spy.requests[len(spy.requests)-1].CommunityEdges)
		})
	}
}
