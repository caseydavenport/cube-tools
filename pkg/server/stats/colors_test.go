package stats

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func makeColorDeck(player string, colors []string, games []types.Game, matches []types.Match, mainboard []types.Card) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Colors = colors
	d.Matches = matches
	d.Mainboard = mainboard
	foldGamesIntoMatches(d, player, games)
	return d
}

func TestColorStats_WinPercent(t *testing.T) {
	decks := []*storage.Deck{
		makeColorDeck("Freddie", []string{"R"}, []types.Game{
			{Opponent: "Ozzy", Winner: "Freddie"},
			{Opponent: "Ozzy", Winner: "Freddie"},
			{Opponent: "Ozzy", Winner: "Ozzy"},
		}, []types.Match{
			{Opponent: "Ozzy", Winner: "Freddie"},
		}, []types.Card{
			{Name: "Lightning Bolt", Colors: []string{"R"}},
		}),
	}

	resp := getColorStats(t, decks, "")
	assert.NotNil(t, resp.All)

	red := resp.All.Data["R"]
	assert.NotNil(t, red)
	assert.Equal(t, 2, red.Wins)
	assert.Equal(t, 1, red.Losses)

	// 2/(2+1) = 66.67 rounded to 67
	assert.InDelta(t, 67.0, red.WinPercent, 0.5)
}

func TestColorStats_MultipleColors(t *testing.T) {
	// In inclusive mode, a WU deck should contribute to W, U, and WU
	decks := []*storage.Deck{
		makeColorDeck("Freddie", []string{"W", "U"}, []types.Game{
			{Opponent: "Ozzy", Winner: "Freddie"},
			{Opponent: "Ozzy", Winner: "Ozzy"},
		}, []types.Match{
			{Opponent: "Ozzy", Winner: "Freddie"},
		}, []types.Card{
			{Name: "Swords to Plowshares", Colors: []string{"W"}},
			{Name: "Counterspell", Colors: []string{"U"}},
		}),
	}

	resp := getColorStats(t, decks, "?color_mode=inclusive")

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
		makeColorDeck("Freddie", []string{"G"}, []types.Game{
			{Opponent: "Ozzy", Winner: "Freddie"},
		}, []types.Match{
			{Opponent: "Ozzy", Winner: "Freddie"},
			{Opponent: "Stevie", Winner: "Freddie"},
			{Opponent: "Joan", Winner: "Freddie"},
		}, []types.Card{
			{Name: "Llanowar Elves", Colors: []string{"G"}},
		}),
	}

	resp := getColorStats(t, decks, "")

	green := resp.All.Data["G"]
	assert.NotNil(t, green)
	assert.Equal(t, 1, green.Trophies)
	assert.Equal(t, 1, green.NumDecks)
}

func TestColorStats_TopBottomHalf(t *testing.T) {
	decks := []*storage.Deck{
		// 2-1 deck is top half
		makeColorDeck("Freddie", []string{"R"}, nil, []types.Match{
			{Opponent: "Ozzy", Winner: "Freddie"},
			{Opponent: "Stevie", Winner: "Freddie"},
			{Opponent: "Joan", Winner: "Joan"},
		}, []types.Card{{Name: "Bolt", Colors: []string{"R"}}}),
		// 1-2 deck is bottom half
		makeColorDeck("Ozzy", []string{"R"}, nil, []types.Match{
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Stevie", Winner: "Stevie"},
			{Opponent: "Joan", Winner: "Ozzy"},
		}, []types.Card{{Name: "Bolt", Colors: []string{"R"}}}),
	}

	resp := getColorStats(t, decks, "")

	red := resp.All.Data["R"]
	assert.NotNil(t, red)
	assert.Equal(t, 1, red.Top50)
	assert.Equal(t, 1, red.Bottom50)
}

func TestColorStats_BuildPercent(t *testing.T) {
	decks := []*storage.Deck{
		makeColorDeck("Freddie", []string{"R"}, nil, nil, []types.Card{{Name: "Bolt", Colors: []string{"R"}}}),
		makeColorDeck("Ozzy", []string{"U"}, nil, nil, []types.Card{{Name: "Recall", Colors: []string{"U"}}}),
		makeColorDeck("Stevie", []string{"R"}, nil, nil, []types.Card{{Name: "Bolt", Colors: []string{"R"}}}),
	}

	resp := getColorStats(t, decks, "")

	red := resp.All.Data["R"]
	assert.NotNil(t, red)

	// 2 out of 3 decks are red is round(67) = 67
	assert.InDelta(t, 67.0, red.BuildPercent, 0.5)

	blue := resp.All.Data["U"]
	assert.NotNil(t, blue)

	// 1 out of 3 is round(33) = 33
	assert.InDelta(t, 33.0, blue.BuildPercent, 0.5)
}

// percentDecks returns three decks with 4 decisive wins between them: a WU
// deck with 1 win, an R deck with 1 win, and a BG deck with 2 wins.
func percentDecks() []*storage.Deck {
	return []*storage.Deck{
		makeColorDeck(
			"Freddie",
			[]string{"W", "U"},
			[]types.Game{{Opponent: "Ozzy", Winner: "Freddie"}, {Opponent: "Ozzy", Winner: "Ozzy"}},
			nil,
			[]types.Card{
				{Name: "Swords to Plowshares", Colors: []string{"W"}},
				{Name: "Counterspell", Colors: []string{"U"}},
			},
		),
		makeColorDeck(
			"Ozzy",
			[]string{"R"},
			[]types.Game{{Opponent: "Freddie", Winner: "Ozzy"}, {Opponent: "Freddie", Winner: "Freddie"}},
			nil,
			[]types.Card{
				{Name: "Lightning Bolt", Colors: []string{"R"}},
				{Name: "Shock", Colors: []string{"R"}},
			},
		),
		makeColorDeck(
			"Debbie",
			[]string{"G", "B"},
			[]types.Game{{Opponent: "Joan", Winner: "Debbie"}, {Opponent: "Joan", Winner: "Debbie"}},
			nil,
			[]types.Card{
				{Name: "Llanowar Elves", Colors: []string{"G"}},
				{Name: "Dark Ritual", Colors: []string{"B"}},
			},
		),
	}
}

// getColorStats serves a colors request over decks with the given query
// string, which is empty or starts with "?".
func getColorStats(t *testing.T, decks []*storage.Deck, query string) ColorStatsResponse {
	t.Helper()
	handler := &colorStatsHandler{q: deckquery.New(&mockDeckStorage{decks: decks}, testCubeSource{})}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/stats/colors"+query, nil))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp ColorStatsResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	return resp
}

// In inclusive mode a deck counts toward every color it plays, but each row
// still divides by all 4 wins in the decks, so the BG deck's 2 wins make B,
// G and BG each 50%, and the column sums past 100%.
func TestColorStats_InclusivePercentOfWinsUsesAllWins(t *testing.T) {
	resp := getColorStats(t, percentDecks(), "?color_mode=inclusive")

	assert.InDelta(t, 25.0, resp.All.Data["W"].PercentOfWins, 0.5)
	assert.InDelta(t, 25.0, resp.All.Data["WU"].PercentOfWins, 0.5)
	assert.InDelta(t, 25.0, resp.All.Data["R"].PercentOfWins, 0.5)
	assert.InDelta(t, 50.0, resp.All.Data["G"].PercentOfWins, 0.5)
	assert.InDelta(t, 50.0, resp.All.Data["BG"].PercentOfWins, 0.5)
}

// In exact mode each deck belongs to one row, so the rows split all the wins
// between them and sum to 100%.
func TestColorStats_ExactPercentOfWinsSumsTo100(t *testing.T) {
	resp := getColorStats(t, percentDecks(), "?color_mode=exact")

	sum := 0.0
	for _, c := range resp.All.Data {
		sum += c.PercentOfWins
	}
	assert.InDelta(t, 100.0, sum, 1.0)
}

// In inclusive mode a WU deck contributes its cards to W, U, and WU rows, and
// the card total inflates the same way, so TotalPickPercentage still sums to
// about 100%. Small drift comes from per-row rounding.
func TestColorStats_InclusivePickPercentagesSumTo100(t *testing.T) {
	resp := getColorStats(t, percentDecks(), "?color_mode=inclusive")

	sumPicks := 0.0
	for _, c := range resp.All.Data {
		sumPicks += c.TotalPickPercentage
	}
	rows := float64(len(resp.All.Data))
	assert.InDelta(t, 100.0, sumPicks, rows, "TotalPickPercentage sum: %v", sumPicks)
}

// TestColorStats_PrimaryModeNoDoubleCounting: a 3-color deck with a clear
// primary pair must contribute only to that pair's bucket in "primary" mode,
// not to every 2-char sub-identity (WU, WG, UG for a WUG deck).
func TestColorStats_PrimaryModeNoDoubleCounting(t *testing.T) {
	// Build a WUG deck where W and U are primary (10 pips each) and G is a splash
	// (2 pips, under half the weaker main color).
	mb := []types.Card{}
	for i := 0; i < 10; i++ {
		mb = append(mb, types.Card{Name: "W card", Colors: []string{"W"}, ManaCost: "{W}", Types: []string{"Creature"}})
		mb = append(mb, types.Card{Name: "U card", Colors: []string{"U"}, ManaCost: "{U}", Types: []string{"Creature"}})
	}
	for i := 0; i < 2; i++ {
		mb = append(mb, types.Card{Name: "G card", Colors: []string{"G"}, ManaCost: "{G}", Types: []string{"Creature"}})
	}
	decks := []*storage.Deck{
		makeColorDeck("Freddie", []string{"W", "U", "G"}, []types.Game{
			{Opponent: "Ozzy", Winner: "Freddie"},
		}, []types.Match{
			{Opponent: "Ozzy", Winner: "Freddie"},
		}, mb),
	}

	resp := getColorStats(t, decks, "?color_mode=primary")

	// WU is the primary pair - the deck should contribute exactly once there.
	assert.NotNil(t, resp.All.Data["WU"])
	assert.Equal(t, 1, resp.All.Data["WU"].NumDecks)

	// The other 2-char sub-identities must NOT pick up the deck.
	if wg, ok := resp.All.Data["WG"]; ok {
		assert.Equal(t, 0, wg.NumDecks, "WG should not pick up a primary-WU deck")
	}
	if ug, ok := resp.All.Data["UG"]; ok {
		assert.Equal(t, 0, ug.NumDecks, "UG should not pick up a primary-WU deck")
	}
}

func TestColorStats_NoDecks(t *testing.T) {
	resp := getColorStats(t, nil, "")
	assert.NotNil(t, resp.All)
	assert.Empty(t, resp.All.Data)
}

// bayesModeCase is one color mode and the Bayesian win rate it should give.
type bayesModeCase struct {
	mode string
	want float64
}

// Each color mode shrinks toward 50% by its own prior: 60 games for exact, and
// 600 for inclusive and primary, whose rows carry much less real signal.
func TestColorStats_BayesianPriorPerMode(t *testing.T) {
	var games []types.Game
	for range 9 {
		games = append(games, types.Game{Opponent: "Ozzy", Winner: "Freddie"})
	}
	games = append(games, types.Game{Opponent: "Ozzy", Winner: "Ozzy"})
	decks := []*storage.Deck{
		makeColorDeck("Freddie", []string{"W", "U"}, games, nil, nil),
	}

	tests := []bayesModeCase{
		// (9 + 30) / (10 + 60) = 55.7%
		{"exact", 55.7},
		// (9 + 300) / (10 + 600) = 50.7%
		{"inclusive", 50.7},
		{"primary", 50.7},
	}
	for _, tc := range tests {
		t.Run(tc.mode, func(t *testing.T) {
			resp := getColorStats(t, decks, "?color_mode="+tc.mode)
			wu := resp.All.Data["WU"]
			assert.NotNil(t, wu)
			assert.Equal(t, tc.want, wu.BayesianWinPercent)
		})
	}
}

// A deck with no decklist and no recorded colors has unknown colors, not
// colorless ones, so it gets no row and isn't counted in Build %.
func TestColorStats_SkipsDecksWithUnknownColors(t *testing.T) {
	win := []types.Game{{Opponent: "Ozzy", Winner: "Freddie"}}
	decks := []*storage.Deck{
		makeColorDeck("Freddie", []string{"W"}, win, nil, nil),
		makeColorDeck("Freddie", nil, win, nil, nil),
	}

	resp := getColorStats(t, decks, "?color_mode=exact")
	assert.NotContains(t, resp.All.Data, "")
	assert.Equal(t, 100.0, resp.All.Data["W"].BuildPercent)
}

func TestColorStats_RejectsBadParameters(t *testing.T) {
	handler := &colorStatsHandler{q: deckquery.New(&mockDeckStorage{decks: percentDecks()}, testCubeSource{})}
	for _, query := range []string{"?color_mode=bogus", "?confidence=1.5", "?confidence=-0.1"} {
		t.Run(query, func(t *testing.T) {
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/stats/colors"+query, nil))
			assert.Equal(t, http.StatusBadRequest, rr.Code)
		})
	}
}

// With bucket_size set, the answer is one set of color rows per time bucket
// and no aggregate.
func TestColorStats_Buckets(t *testing.T) {
	win := []types.Game{{Opponent: "Ozzy", Winner: "Freddie"}}
	first := makeColorDeck("Freddie", []string{"R"}, win, nil, nil)
	first.Metadata.DraftID, first.Date = 1, "2026-01-01"
	second := makeColorDeck("Freddie", []string{"U"}, win, nil, nil)
	second.Metadata.DraftID, second.Date = 2, "2026-02-01"

	resp := getColorStats(t, []*storage.Deck{first, second}, "?bucket_size=1&sliding=true")

	assert.Nil(t, resp.All)
	require.Len(t, resp.Buckets, 2)
	assert.Equal(t, "2026-01-01", resp.Buckets[0].Start)
	assert.Contains(t, resp.Buckets[0].Data, "R")
	assert.NotContains(t, resp.Buckets[0].Data, "U")
	assert.Contains(t, resp.Buckets[1].Data, "U")
}

// A colorless card matches no color, so it adds to no row's card count.
func TestColorStats_ColorlessCardsCountForNoColor(t *testing.T) {
	decks := []*storage.Deck{
		makeColorDeck("Freddie", []string{"R"}, nil, nil, []types.Card{
			{Name: "Bolt", Colors: []string{"R"}},
			{Name: "Sol Ring"},
		}),
	}

	resp := getColorStats(t, decks, "")

	assert.Equal(t, 1, resp.All.Data["R"].Cards)
}
