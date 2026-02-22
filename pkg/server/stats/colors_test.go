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

func makeColorDeck(player string, colors []string, games []types.Game, matches []types.Match, mainboard []types.Card) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Colors = colors
	d.Games = games
	d.Matches = matches
	d.Mainboard = mainboard
	return d
}

// --- Basic color aggregation ---

func TestColorStats_WinPercent(t *testing.T) {
	decks := []*storage.Deck{
		makeColorDeck("Alice", []string{"R"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Bob"},
		}, []types.Match{
			{Opponent: "Bob", Winner: "Alice"},
		}, []types.Card{
			{Name: "Lightning Bolt", Colors: []string{"R"}},
		}),
	}

	handler := &colorStatsHandler{store: &mockDeckStorage{decks: decks}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/colors", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ColorStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)
	assert.NotNil(t, resp.All)

	red := resp.All.Data["R"]
	assert.NotNil(t, red)
	assert.Equal(t, 2, red.Wins)
	assert.Equal(t, 1, red.Losses)
	// 2/(2+1) = 66.67 → rounded to 67
	assert.InDelta(t, 67.0, red.WinPercent, 0.5)
}

func TestColorStats_MultipleColors(t *testing.T) {
	// A WU deck should contribute to W, U, and WU
	decks := []*storage.Deck{
		makeColorDeck("Alice", []string{"W", "U"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Bob"},
		}, []types.Match{
			{Opponent: "Bob", Winner: "Alice"},
		}, []types.Card{
			{Name: "Swords to Plowshares", Colors: []string{"W"}},
			{Name: "Counterspell", Colors: []string{"U"}},
		}),
	}

	handler := &colorStatsHandler{store: &mockDeckStorage{decks: decks}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/colors", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ColorStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	// Should have entries for W, U, and WU
	assert.NotNil(t, resp.All.Data["W"])
	assert.NotNil(t, resp.All.Data["U"])
	assert.NotNil(t, resp.All.Data["WU"])

	// All share the same deck's stats
	assert.Equal(t, 1, resp.All.Data["W"].Wins)
	assert.Equal(t, 1, resp.All.Data["WU"].Wins)
}

func TestColorStats_Trophies(t *testing.T) {
	decks := []*storage.Deck{
		makeColorDeck("Alice", []string{"G"}, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},
		}, []types.Match{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Charlie", Winner: "Alice"},
			{Opponent: "Dave", Winner: "Alice"},
		}, []types.Card{
			{Name: "Llanowar Elves", Colors: []string{"G"}},
		}),
	}

	handler := &colorStatsHandler{store: &mockDeckStorage{decks: decks}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/colors", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ColorStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	green := resp.All.Data["G"]
	assert.NotNil(t, green)
	assert.Equal(t, 1, green.Trophies)
	assert.Equal(t, 1, green.NumDecks)
}

func TestColorStats_TopBottomHalf(t *testing.T) {
	decks := []*storage.Deck{
		// 2-1 deck → top half
		makeColorDeck("Alice", []string{"R"}, nil, []types.Match{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Charlie", Winner: "Alice"},
			{Opponent: "Dave", Winner: "Dave"},
		}, []types.Card{{Name: "Bolt", Colors: []string{"R"}}}),
		// 1-2 deck → bottom half
		makeColorDeck("Bob", []string{"R"}, nil, []types.Match{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Charlie", Winner: "Charlie"},
			{Opponent: "Dave", Winner: "Bob"},
		}, []types.Card{{Name: "Bolt", Colors: []string{"R"}}}),
	}

	handler := &colorStatsHandler{store: &mockDeckStorage{decks: decks}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/colors", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ColorStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	red := resp.All.Data["R"]
	assert.NotNil(t, red)
	assert.Equal(t, 1, red.Top50)
	assert.Equal(t, 1, red.Bottom50)
}

func TestColorStats_BuildPercent(t *testing.T) {
	decks := []*storage.Deck{
		makeColorDeck("Alice", []string{"R"}, nil, nil, []types.Card{{Name: "Bolt", Colors: []string{"R"}}}),
		makeColorDeck("Bob", []string{"U"}, nil, nil, []types.Card{{Name: "Recall", Colors: []string{"U"}}}),
		makeColorDeck("Charlie", []string{"R"}, nil, nil, []types.Card{{Name: "Bolt", Colors: []string{"R"}}}),
	}

	handler := &colorStatsHandler{store: &mockDeckStorage{decks: decks}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/colors", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ColorStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	red := resp.All.Data["R"]
	assert.NotNil(t, red)
	// 2 out of 3 decks are red → round(67) = 67
	assert.InDelta(t, 67.0, red.BuildPercent, 0.5)

	blue := resp.All.Data["U"]
	assert.NotNil(t, blue)
	// 1 out of 3 → round(33) = 33
	assert.InDelta(t, 33.0, blue.BuildPercent, 0.5)
}

func TestColorStats_NoDecks(t *testing.T) {
	handler := &colorStatsHandler{store: &mockDeckStorage{decks: nil}}
	req := httptest.NewRequest(http.MethodGet, "/api/stats/colors", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp ColorStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)
	assert.NotNil(t, resp.All)
	assert.Empty(t, resp.All.Data)
}
