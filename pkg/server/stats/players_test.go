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
	d1.Matches = []types.Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Charlie"},
		{Opponent: "Dave", Winner: "Alice"},
	}
	foldGamesIntoMatches(d1, "Alice", []types.Game{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Bob", Winner: "Alice"},
	})
	d1.OpponentWinPercentage = 60
	d1.RatedOpponents = 3

	d2 := &storage.Deck{}
	d2.Player = "Alice"
	d2.Matches = []types.Match{
		{Opponent: "Eve", Winner: "Eve"},
	}
	foldGamesIntoMatches(d2, "Alice", []types.Game{
		{Opponent: "Eve", Winner: "Eve"},
	})
	d2.OpponentWinPercentage = 40
	d2.RatedOpponents = 1

	handler := &playerStatsHandler{q: newQuery(&mockDeckStorage{decks: []*storage.Deck{d1, d2}}, testCubeSource{})}
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

func TestPlayerStats_OpponentWinPercent_SkipsUnratedDecks(t *testing.T) {
	// A deck with no rated opponents, from an old record or a two-player
	// draft, has an unknown opponent win % that reads as 0. Averaging it in
	// would drag the player down to 30.
	named := &storage.Deck{}
	named.Player = "Ozzy"
	named.Matches = []types.Match{{Opponent: "Stevie", Wins: 2, Losses: 1}}
	named.OpponentWinPercentage = 60
	named.RatedOpponents = 1

	unnamed := &storage.Deck{}
	unnamed.Player = "Ozzy"
	unnamed.Matches = []types.Match{{Wins: 2, Losses: 1}}

	handler := &playerStatsHandler{q: newQuery(&mockDeckStorage{decks: []*storage.Deck{named, unnamed}}, testCubeSource{})}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/stats/players", nil))

	var resp PlayerStatsResponse
	assert.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.InDelta(t, 60.0, resp.Players["Ozzy"].OpponentWinPercent, 0.5)
}

// --- Basic aggregation ---

func TestPlayerStats_BasicAggregation(t *testing.T) {
	d1 := makeStorageDeck("Alice", 1, []string{"aggro"}, []types.Game{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Bob", Winner: "Bob"},
	}, []types.Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Dave", Winner: "Alice"},
	})

	d2 := makeStorageDeck("Alice", 2, []string{"control"}, []types.Game{
		{Opponent: "Eve", Winner: "Eve"},
		{Opponent: "Eve", Winner: "Alice"},
	}, []types.Match{
		{Opponent: "Eve", Winner: "Eve"},
		{Opponent: "Frank", Winner: "Frank"},
		{Opponent: "Grace", Winner: "Grace"},
	})

	handler := &playerStatsHandler{q: newQuery(&mockDeckStorage{decks: []*storage.Deck{d1, d2}}, testCubeSource{})}
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

func TestPlayerStatsSkipsAnonymous(t *testing.T) {
	seat := func(draft int) *storage.Deck {
		d := makeStorageDeck("p3", draft, nil, nil, []types.Match{{OpponentID: 1, Wins: 2}})
		d.ID = 3
		return d
	}
	named := func(draft int) *storage.Deck {
		d := makeStorageDeck("Freddie", draft, nil, nil, []types.Match{{OpponentID: 3, Wins: 2}})
		d.ID, d.PlayerID = 1, 1
		return d
	}
	decks := []*storage.Deck{seat(1), seat(2), named(1), named(2)}

	handler := &playerStatsHandler{q: newQuery(&mockDeckStorage{decks: decks}, testCubeSource{})}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/stats/players", nil))

	var resp PlayerStatsResponse
	assert.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Len(t, resp.Players, 1)
	freddie := resp.Players["Freddie"]
	if assert.NotNil(t, freddie) {
		assert.Equal(t, 1, freddie.ID)
		assert.Equal(t, 2, freddie.NumDecks)
	}
}
