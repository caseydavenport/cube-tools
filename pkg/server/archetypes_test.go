package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/storage/router"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

type mockDeckStorage struct {
	decks []*storage.Deck
}

func (m *mockDeckStorage) List(_ string, _ *storage.DecksRequest) ([]*storage.Deck, error) {
	return m.decks, nil
}

func (m *mockDeckStorage) UpdateDeckMeta(_ string, _ storage.DeckMetaWrite) (*storage.Deck, error) {
	return nil, nil
}

func (m *mockDeckStorage) GetRules(_ string) (*design.DesignMapConfig, error) {
	return nil, storage.ErrUnsupported
}

// GetOverrides reports no forced packages.
func (m *mockDeckStorage) GetOverrides(_ string) (design.PackageOverrides, error) {
	return design.PackageOverrides{}, nil
}

// GetSnapshot reports no snapshot for any draft.
func (m *mockDeckStorage) GetSnapshot(_ string, _ int) (*types.Cube, error) {
	return nil, storage.ErrDeckNotFound
}

func makeStorageDeck(player string, draftID int, labels []string, games []types.Game, matches []types.Match) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draftID
	d.Labels = labels
	d.Games = games
	d.Matches = matches
	return d
}

// --- LookupOpponentMacro ---

func TestLookupOpponentMacro_Found(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", 1, []string{"aggro"}, nil, nil),
		makeStorageDeck("Bob", 1, []string{"control"}, nil, nil),
	}

	result := LookupOpponentMacro(decks, decks[0], "Bob")
	assert.Equal(t, "control", result)
}

func TestLookupOpponentMacro_NotFound(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", 1, []string{"aggro"}, nil, nil),
	}

	result := LookupOpponentMacro(decks, decks[0], "Unknown")
	assert.Equal(t, "", result)
}

func TestLookupOpponentMacro_WrongDraft(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", 1, []string{"aggro"}, nil, nil),
		// Bob's deck is from a different draft.
		makeStorageDeck("Bob", 2, []string{"control"}, nil, nil),
	}

	result := LookupOpponentMacro(decks, decks[0], "Bob")
	assert.Equal(t, "", result)
}

// --- Archetypes handler: draws excluded ---

func TestArchetypesHandler_DrawsExcluded(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", 1, []string{"aggro"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},       // win
			{Opponent: "Bob", Winner: "Bob"},         // loss
			{Opponent: "Bob", Winner: ""},            // draw - should not count
			{Opponent: "Bob", Winner: "", Tie: true}, // draw - should not count
		}, nil),
		makeStorageDeck("Bob", 1, []string{"control"}, []types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Bob"},
			{Opponent: "Alice", Winner: ""},
			{Opponent: "Alice", Winner: "", Tie: true},
		}, nil),
	}

	handler := &archetypesHandler{q: deckquery.New(&mockDeckStorage{decks: decks}, fixedCube{cube: &types.Cube{}})}
	req := httptest.NewRequest(http.MethodGet, "/api/archetypes", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ArchetypesResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	// Find aggro vs control
	for _, arch := range resp.Items {
		if arch.Name == "aggro" {
			for _, vs := range arch.Versus {
				if vs.Name == "control" {
					assert.Equal(t, 1, vs.Win)
					assert.Equal(t, 1, vs.Loss)
					return
				}
			}
		}
	}
	t.Fatal("expected aggro vs control matchup data")
}

func TestArchetypesHandlerNoArchetypesSendsEmptyItems(t *testing.T) {
	// The UI indexes into items, so a cube with no labeled decks must get an
	// empty list rather than null.
	decks := []*storage.Deck{makeStorageDeck("Freddie", 1, nil, nil, nil)}
	handler := &archetypesHandler{q: deckquery.New(&mockDeckStorage{decks: decks}, fixedCube{cube: &types.Cube{}})}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/archetypes", nil))
	require.Equal(t, http.StatusOK, rr.Code)
	assert.JSONEq(t, `{"items":[]}`, rr.Body.String())
}

// stubCubeCobra serves fixed decks for cc: cubes, standing in for the
// read-only CubeCobra backend behind the router.
type stubCubeCobra struct {
	decks []*storage.Deck
}

func (s stubCubeCobra) RawDecks(string) ([]*storage.Deck, error) {
	return s.decks, nil
}

func (s stubCubeCobra) Index(string) (*storage.CubeIndex, error) {
	return &storage.CubeIndex{}, nil
}

func archetypesRequest(cube, query string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/"+cube+"/archetypes?"+query, nil)
	return r.WithContext(ContextWithCube(context.Background(), cube))
}

func TestArchetypesHandlerReadsCubeCobraCube(t *testing.T) {
	freddie := makeStorageDeck("Freddie", 1, []string{"aggro"}, nil, []types.Match{{Opponent: "Joan", Wins: 1}})
	freddie.Date = "2026-03-01"
	joan := makeStorageDeck("Joan", 1, []string{"control"}, nil, []types.Match{{Opponent: "Freddie", Losses: 1}})
	joan.Date = "2026-03-01"
	store := storage.NewStore(router.New(memory.New(), stubCubeCobra{decks: []*storage.Deck{freddie, joan}}))

	rr := httptest.NewRecorder()
	ArchetypesHandler(store, fixedCube{cube: &types.Cube{}}).ServeHTTP(rr, archetypesRequest("cc:abc", ""))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp ArchetypesResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	var aggro *ArchetypeData
	for i := range resp.Items {
		if resp.Items[i].Name == "aggro" {
			aggro = &resp.Items[i]
		}
	}
	require.NotNil(t, aggro, "the cc: cube's decks reach the handler")
	assert.Equal(t, []VersusData{{Name: "control", Win: 1}}, aggro.Versus)
}

func TestArchetypesHandlerPackageFilters(t *testing.T) {
	ozzy := makeStorageDeck("Ozzy", 1, []string{"aggro"}, nil, nil)
	stevie := makeStorageDeck("Stevie", 1, []string{"control"}, nil, nil)
	for _, d := range []*storage.Deck{ozzy, stevie} {
		d.Date = "2026-03-01"
	}
	ozzy.Mainboard = []types.Card{{Name: "gy1"}, {Name: "gy2"}, {Name: "gy3"}}
	stevie.Mainboard = []types.Card{{Name: "gy1"}, {Name: "gy2"}, {Name: "Forest"}}
	rules := &design.DesignMapConfig{
		Groups: []design.Group{{Name: "Graveyard cards", Conditions: []string{"n:gy1", "n:gy2", "n:gy3"}}},
		Packages: []design.Package{
			{Name: "Graveyard", Wires: []design.Wire{{Sources: []string{"Graveyard cards"}, Targets: []string{"Graveyard cards"}}}},
		},
	}
	store := memory.NewStore(func(b *memory.Backend) {
		b.SeedRules("testcube", rules)
		b.Seed("testcube", ozzy, stevie)
	})
	cube := fixedCube{cube: &types.Cube{Cards: []types.Card{{Name: "gy1"}, {Name: "gy2"}, {Name: "gy3"}}}}

	rr := httptest.NewRecorder()
	ArchetypesHandler(store, cube).ServeHTTP(rr, archetypesRequest("testcube", "match=package:graveyard"))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp ArchetypesResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	var names []string
	for _, item := range resp.Items {
		names = append(names, item.Name)
	}
	assert.Equal(t, []string{"aggro"}, names)
}

// fixedCube serves one list as today's.
type fixedCube struct {
	cube *types.Cube
}

// Current returns the list.
func (c fixedCube) Current(string) (*types.Cube, error) {
	return c.cube, nil
}

// Refresh returns the list.
func (c fixedCube) Refresh(string) (*types.Cube, error) {
	return c.cube, nil
}
