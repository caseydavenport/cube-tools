package stats

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

type mockDeckStorage struct {
	decks []*storage.Deck
}

func (m *mockDeckStorage) List(_ *storage.DecksRequest) ([]*storage.Deck, error) {
	return m.decks, nil
}

func makeStorageDeck(player, draftID string, labels []string, games []types.Game, matches []types.Match) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draftID
	d.Labels = labels
	d.Games = games
	d.Matches = matches
	return d
}

// --- SharedWith: "tempo" excluded ---

func TestArchetypeStats_SharedWith_TempoSkip(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", "d1", []string{"tempo", "spells"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},
		}, []types.Match{
			{Opponent: "Bob", Winner: "Alice"},
		}),
	}

	handler := &archetypeStatsHandler{store: &mockDeckStorage{decks: decks}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/archetypes", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ArchetypeStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	// "spells" archetype's SharedWith should NOT contain "tempo"
	spells := resp.Archetypes["spells"]
	assert.NotNil(t, spells)
	_, hasTempo := spells.SharedWith["tempo"]
	assert.False(t, hasTempo, "tempo should be excluded from SharedWith")

	// "tempo" archetype's SharedWith should NOT contain "spells" macro entries
	// but should contain non-macro labels... wait, actually "tempo" IS a macro.
	// For the "tempo" label, SharedWith should include "spells"
	tempo := resp.Archetypes["tempo"]
	assert.NotNil(t, tempo)
	assert.Equal(t, 1, tempo.SharedWith["spells"])
}

// --- WinPercent ---

func TestArchetypeStats_WinPercent(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", "d1", []string{"aggro"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Bob"},
		}, nil),
		makeStorageDeck("Bob", "d1", []string{"aggro"}, []types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Bob"},
		}, nil),
	}

	handler := &archetypeStatsHandler{store: &mockDeckStorage{decks: decks}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/archetypes", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ArchetypeStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	aggro := resp.Archetypes["aggro"]
	assert.NotNil(t, aggro)
	// 3 wins, 3 losses → 50%
	assert.InDelta(t, 50.0, aggro.WinPercent, 0.5)
}

// --- TotalGames equals totalWins (no double-counting) ---

func TestArchetypeStats_TotalGames(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", "d1", []string{"aggro"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Bob"},
		}, nil),
		makeStorageDeck("Bob", "d1", []string{"control"}, []types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Bob"},
		}, nil),
	}

	handler := &archetypeStatsHandler{store: &mockDeckStorage{decks: decks}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/archetypes", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ArchetypeStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	// Each game is counted once as a win for the winning deck.
	// Alice: 1 win, Bob: 1 win → totalGames = 2 (sum of GameWins across all decks)
	assert.Equal(t, 2, resp.TotalGames)
}
