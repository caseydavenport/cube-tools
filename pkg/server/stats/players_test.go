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

// --- OpponentWinPercent: weighted by match count ---

func TestPlayerStats_OpponentWinPercent_Weighted(t *testing.T) {
	// Deck 1: 3 matches, OWP=60
	// Deck 2: 1 match, OWP=40
	// Weighted: (60*3 + 40*1) / 4 = 220/4 = 55, NOT (60+40)/2 = 50
	d1 := &storage.Deck{}
	d1.Player = "Alice"
	d1.Games = []types.Game{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Bob", Winner: "Alice"},
	}
	d1.Matches = []types.Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Charlie"},
		{Opponent: "Dave", Winner: "Alice"},
	}
	d1.OpponentWinPercentage = 60

	d2 := &storage.Deck{}
	d2.Player = "Alice"
	d2.Games = []types.Game{
		{Opponent: "Eve", Winner: "Eve"},
	}
	d2.Matches = []types.Match{
		{Opponent: "Eve", Winner: "Eve"},
	}
	d2.OpponentWinPercentage = 40

	handler := &playerStatsHandler{store: &mockDeckStorage{decks: []*storage.Deck{d1, d2}}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/players", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp PlayerStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	alice := resp.Players["Alice"]
	assert.NotNil(t, alice)
	// Weighted: round((60*3 + 40*1) / 4) = round(55) = 55
	assert.InDelta(t, 55.0, alice.OpponentWinPercent, 0.5)
}

// --- Basic aggregation ---

func TestPlayerStats_BasicAggregation(t *testing.T) {
	d1 := makeStorageDeck("Alice", "d1", []string{"aggro"}, []types.Game{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Bob", Winner: "Bob"},
	}, []types.Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Dave", Winner: "Alice"},
	})

	d2 := makeStorageDeck("Alice", "d2", []string{"control"}, []types.Game{
		{Opponent: "Eve", Winner: "Eve"},
		{Opponent: "Eve", Winner: "Alice"},
	}, []types.Match{
		{Opponent: "Eve", Winner: "Eve"},
		{Opponent: "Frank", Winner: "Frank"},
		{Opponent: "Grace", Winner: "Grace"},
	})

	handler := &playerStatsHandler{store: &mockDeckStorage{decks: []*storage.Deck{d1, d2}}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/players", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp PlayerStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	alice := resp.Players["Alice"]
	assert.NotNil(t, alice)
	assert.Equal(t, 2, alice.NumDecks)
	assert.Equal(t, 3, alice.Wins)   // 2 + 1
	assert.Equal(t, 2, alice.Losses) // 1 + 1
	assert.Equal(t, 5, alice.Games)  // 3 + 2
	assert.Equal(t, 1, alice.Trophies)
	assert.Equal(t, 1, alice.LastPlace)
}
