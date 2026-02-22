package server

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

// --- LookupOpponentMacro ---

func TestLookupOpponentMacro_Found(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", "draft1", []string{"aggro"}, nil, nil),
		makeStorageDeck("Bob", "draft1", []string{"control"}, nil, nil),
	}

	result := LookupOpponentMacro(decks, decks[0], "Bob")
	assert.Equal(t, "control", result)
}

func TestLookupOpponentMacro_NotFound(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", "draft1", []string{"aggro"}, nil, nil),
	}

	result := LookupOpponentMacro(decks, decks[0], "Unknown")
	assert.Equal(t, "", result)
}

func TestLookupOpponentMacro_WrongDraft(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", "draft1", []string{"aggro"}, nil, nil),
		makeStorageDeck("Bob", "draft2", []string{"control"}, nil, nil), // different draft
	}

	result := LookupOpponentMacro(decks, decks[0], "Bob")
	assert.Equal(t, "", result)
}

// --- Archetypes handler: draws excluded ---

func TestArchetypesHandler_DrawsExcluded(t *testing.T) {
	decks := []*storage.Deck{
		makeStorageDeck("Alice", "d1", []string{"aggro"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},          // win
			{Opponent: "Bob", Winner: "Bob"},            // loss
			{Opponent: "Bob", Winner: ""},               // draw - should not count
			{Opponent: "Bob", Winner: "", Tie: true},    // draw - should not count
		}, nil),
		makeStorageDeck("Bob", "d1", []string{"control"}, []types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Bob"},
			{Opponent: "Alice", Winner: ""},
			{Opponent: "Alice", Winner: "", Tie: true},
		}, nil),
	}

	handler := &archetypesHandler{store: &mockDeckStorage{decks: decks}}
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
