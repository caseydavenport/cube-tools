package stats

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// makePivotDeck builds a storage deck with everything the pivot engine reads:
// colors, archetype, mainboard (for composition), a draft ID + date (for
// opponent matching and time buckets), and a flattened Games slice.
func makePivotDeck(player string, draftID int, date string, colors []string, arch string, mainboard []types.Card, games []types.Game) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draftID
	d.Date = date
	d.Colors = colors
	d.MacroArchetype = arch
	d.Mainboard = mainboard
	foldGamesIntoMatches(d, player, games)
	return d
}

func dim(name string, gran int, mode string) PivotDimension {
	return PivotDimension{Dim: name, Granularity: gran, ColorMode: colorMode(mode)}
}

func rowByKey(resp *PivotResponse, key string) *PivotRow {
	for _, r := range resp.Rows {
		if r.Key == key {
			return r
		}
	}
	return nil
}

// The headline de-confounder: a "color excludes B" predicate strips Orzhov
// decks out of the White row, so white's win rate is measured without its black
// half propping it up.
func TestPivot_ColorExcludesBlack(t *testing.T) {
	decks := []*storage.Deck{
		// Orzhov (WB) deck, winning.
		makePivotDeck(
			"Freddie",
			1,
			"2025-01-01",
			[]string{"W", "B"},
			"midrange",
			[]types.Card{{Name: "wc", Colors: []string{"W"}}, {Name: "bc", Colors: []string{"B"}}},
			[]types.Game{{Opponent: "Ozzy", Winner: "Freddie"}, {Opponent: "Ozzy", Winner: "Freddie"}},
		),
		// Mono-white deck, even.
		makePivotDeck(
			"Debbie",
			1,
			"2025-01-01",
			[]string{"W"},
			"aggro",
			[]types.Card{{Name: "wc", Colors: []string{"W"}}},
			[]types.Game{{Opponent: "Joan", Winner: "Debbie"}, {Opponent: "Joan", Winner: "Joan"}},
		),
	}

	group := dim("color", 1, "inclusive")

	// Without the predicate, White is propped up by the WB deck: 3-1.
	all := computePivot(decks, decks, &PivotRequest{GroupBy: group}, nil, nil)
	whiteRow := rowByKey(all, "W")
	require.NotNil(t, whiteRow)
	assert.Equal(t, 3, whiteRow.Cells[""].Wins)
	assert.Equal(t, 1, whiteRow.Cells[""].Losses)
	assert.NotNil(t, rowByKey(all, "B"), "B row present when unfiltered")

	// Excluding black, only the mono-white deck remains: 1-1 (50%).
	filtered := computePivot(decks, decks, &PivotRequest{
		GroupBy:    group,
		Predicates: []PivotPredicate{{Dim: "color", Op: "excludes", Value: "B"}},
	}, nil, nil)
	whiteRow = rowByKey(filtered, "W")
	require.NotNil(t, whiteRow)
	assert.Equal(t, 1, whiteRow.Cells[""].Wins)
	assert.Equal(t, 1, whiteRow.Cells[""].Losses)
	assert.InDelta(t, 50.0, whiteRow.Cells[""].WinPercent, 0.1)
	assert.Nil(t, rowByKey(filtered, "B"), "B row gone once black decks are excluded")
	assert.Equal(t, 1, whiteRow.Cells[""].Decks, "only the mono-white deck counts")
}

// Group by color at Dual granularity yields guild pairs.
func TestPivot_DualGuildPairs(t *testing.T) {
	decks := []*storage.Deck{
		makePivotDeck("Freddie", 1, "2025-01-01", []string{"W", "U"}, "control", nil, []types.Game{{Opponent: "Ozzy", Winner: "Freddie"}}),
		makePivotDeck("Debbie", 1, "2025-01-01", []string{"B", "G"}, "midrange", nil, []types.Game{{Opponent: "Joan", Winner: "Mick"}}),
	}
	resp := computePivot(decks, decks, &PivotRequest{GroupBy: dim("color", 2, "exact")}, nil, nil)

	wu := rowByKey(resp, "WU")
	require.NotNil(t, wu)
	assert.Equal(t, 1, wu.Cells[""].Wins)
	bg := rowByKey(resp, "BG")
	require.NotNil(t, bg)
	assert.Equal(t, 1, bg.Cells[""].Losses)

	// Mono/other pairs should not appear in exact Dual mode.
	assert.Nil(t, rowByKey(resp, "W"))
	assert.Nil(t, rowByKey(resp, "WB"))
}

// Splitting by opponent color reproduces a matchup matrix: each game is keyed by
// the subject's color (row) and the opponent's color (column).
func TestPivot_OpponentColorMatchup(t *testing.T) {
	decks := []*storage.Deck{
		makePivotDeck("Freddie", 1, "2025-01-01", []string{"W"}, "", nil, []types.Game{{Opponent: "Ozzy", Winner: "Freddie"}}),
		makePivotDeck("Ozzy", 1, "2025-01-01", []string{"R"}, "", nil, []types.Game{{Opponent: "Freddie", Winner: "Freddie"}}),
	}
	resp := computePivot(decks, decks, &PivotRequest{
		GroupBy: dim("color", 1, "inclusive"),
		SplitBy: dim("opponent_color", 1, "inclusive"),
	}, nil, nil)

	// White beat Red.
	w := rowByKey(resp, "W")
	require.NotNil(t, w)
	require.NotNil(t, w.Cells["R"])
	assert.Equal(t, 1, w.Cells["R"].Wins)
	assert.Equal(t, 0, w.Cells["R"].Losses)

	// Red lost to White.
	r := rowByKey(resp, "R")
	require.NotNil(t, r)
	require.NotNil(t, r.Cells["W"])
	assert.Equal(t, 0, r.Cells["W"].Wins)
	assert.Equal(t, 1, r.Cells["W"].Losses)

	// "" overall column always present and first.
	assert.Equal(t, "", resp.Columns[0])
}

// The deck filter narrows the subject decks, but opponents still resolve from
// every deck, so Ozzy's game against Stevie lands in the R column even though
// Stevie's deck isn't a subject.
func TestPivot_DeckFilterKeepsOpponents(t *testing.T) {
	ozzy := makePivotDeck("Ozzy", 1, "2026-01-01", []string{"W"}, "", nil, []types.Game{{Opponent: "Stevie", Winner: "Ozzy"}})
	stevie := makePivotDeck("Stevie", 1, "2026-01-01", []string{"R"}, "", nil, []types.Game{{Opponent: "Ozzy", Winner: "Ozzy"}})
	resp := computePivot([]*storage.Deck{ozzy, stevie}, []*storage.Deck{ozzy}, &PivotRequest{
		GroupBy: dim("color", 1, "inclusive"),
		SplitBy: dim("opponent_color", 1, "inclusive"),
	}, nil, nil)

	w := rowByKey(resp, "W")
	require.NotNil(t, w)
	require.NotNil(t, w.Cells["R"])
	assert.Equal(t, 1, w.Cells["R"].Wins)
	assert.Nil(t, rowByKey(resp, "R"), "Stevie's deck isn't a subject")
}

// A numeric composition predicate filters on the per-deck count.
func TestPivot_CompositionPredicate(t *testing.T) {
	removalCard := types.Card{Name: "Doom Blade", Colors: []string{"B"}, OracleTags: []string{"removal"}}
	vanilla := types.Card{Name: "Bear", Colors: []string{"B"}, Types: []string{"Creature"}, OracleText: "A bear."}

	decks := []*storage.Deck{
		// 3 removal spells - passes removal >= 3.
		makePivotDeck(
			"Freddie",
			1,
			"2025-01-01",
			[]string{"B"},
			"control",
			[]types.Card{removalCard, removalCard, removalCard, vanilla},
			[]types.Game{{Opponent: "Ozzy", Winner: "Freddie"}},
		),
		// 0 removal - filtered out.
		makePivotDeck("Debbie", 1, "2025-01-01", []string{"B"}, "aggro", []types.Card{vanilla, vanilla}, []types.Game{{Opponent: "Joan", Winner: "Joan"}}),
	}
	resp := computePivot(decks, decks, &PivotRequest{
		GroupBy:    dim("color", 1, "inclusive"),
		Predicates: []PivotPredicate{{Dim: "removal", Op: "gte", Value: "3"}},
	}, nil, nil)

	blackRow := rowByKey(resp, "B")
	require.NotNil(t, blackRow)
	assert.Equal(t, 1, blackRow.Cells[""].Wins)
	assert.Equal(t, 0, blackRow.Cells[""].Losses)
	assert.Equal(t, 1, blackRow.Cells[""].Decks, "only the removal-heavy deck counts")
}

// Grouping by time yields one row per bucket, labeled by the bucket's start date.
func TestPivot_TimeGrouping(t *testing.T) {
	decks := []*storage.Deck{
		makePivotDeck("Freddie", 1, "2025-01-01", []string{"R"}, "", nil, []types.Game{{Opponent: "Ozzy", Winner: "Freddie"}}),
		makePivotDeck("Debbie", 2, "2025-02-01", []string{"R"}, "", nil, []types.Game{{Opponent: "Joan", Winner: "Joan"}}),
	}
	resp := computePivot(decks, decks, &PivotRequest{GroupBy: dim("time", 0, ""), BucketSize: 1}, nil, nil)

	require.Len(t, resp.Rows, 2)
	jan := rowByKey(resp, "2025-01-01")
	require.NotNil(t, jan)
	assert.Equal(t, 1, jan.Cells[""].Wins)
	feb := rowByKey(resp, "2025-02-01")
	require.NotNil(t, feb)
	assert.Equal(t, 1, feb.Cells[""].Losses)

	// Rows are ordered chronologically.
	assert.Equal(t, "2025-01-01", resp.Rows[0].Key)
	assert.Equal(t, "2025-02-01", resp.Rows[1].Key)
}

// Excluding a player drops both their decks and every game played against them,
// so a heavy outlier can be removed from the aggregate entirely.
func TestPivot_ExcludePlayers(t *testing.T) {
	decks := []*storage.Deck{
		makePivotDeck("Freddie", 1, "2025-01-01", []string{"W"}, "", nil, []types.Game{
			// dropped: vs excluded Ozzy
			{Opponent: "Ozzy", Winner: "Freddie"},

			// kept: Freddie loss
			{Opponent: "Debbie", Winner: "Debbie"},
		}),
		makePivotDeck("Ozzy", 1, "2025-01-01", []string{"R"}, "", nil, []types.Game{
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Debbie", Winner: "Ozzy"},
		}),
		makePivotDeck("Debbie", 1, "2025-01-01", []string{"U"}, "", nil, []types.Game{
			// kept: Debbie win
			{Opponent: "Freddie", Winner: "Debbie"},

			// dropped: vs excluded Ozzy
			{Opponent: "Ozzy", Winner: "Ozzy"},
		}),
	}
	resp := computePivot(decks, decks, &PivotRequest{
		GroupBy: dim("color", 1, "inclusive"),

		// case-insensitive
		ExcludePlayers: []string{"ozzy"},
	}, nil, nil)

	assert.Nil(t, rowByKey(resp, "R"), "excluded player's own deck is gone")

	w := rowByKey(resp, "W")
	require.NotNil(t, w)
	assert.Equal(t, 0, w.Cells[""].Wins)

	// only the vs-Debbie game survives
	assert.Equal(t, 1, w.Cells[""].Losses)

	u := rowByKey(resp, "U")
	require.NotNil(t, u)

	// only the vs-Freddie game survives
	assert.Equal(t, 1, u.Cells[""].Wins)
	assert.Equal(t, 0, u.Cells[""].Losses)
}

// composition counts nonland cards by classifier and reports the land count and
// average mana value separately.
func TestComposition(t *testing.T) {
	d := &storage.Deck{}
	d.Mainboard = []types.Card{
		{Name: "Doom Blade", OracleTags: []string{"removal"}, CMC: 2},
		{Name: "Counterspell", OracleTags: []string{"counterspell"}, CMC: 2},
		{Name: "Bear", Types: []string{"Creature"}, OracleText: "grr", CMC: 4},
		{Name: "Island", Types: []string{"Basic", "Land"}},
	}
	comp := composition(d, nil)
	assert.Equal(t, 1, comp.Removal)

	// removal + counterspell
	assert.Equal(t, 2, comp.Interaction)
	assert.Equal(t, 1, comp.Counterspell)
	assert.Equal(t, 1, comp.Creatures)
	assert.Equal(t, 1, comp.Lands)

	// Average CMC over the 3 nonland cards: (2+2+4)/3.
	assert.InDelta(t, 2.67, comp.AvgCMC, 0.01)
}

// Opponent composition and archetype splits key each game by the opponent
// deck's bucket, and skip opponents with no recorded mainboard rather than
// bucketing them at zero.
func TestPivot_OpponentCompositionSplit(t *testing.T) {
	creature := types.Card{Name: "Bear", Types: []string{"Creature"}, OracleText: "A bear."}
	board := make([]types.Card, 12)
	for i := range board {
		board[i] = creature
	}

	decks := []*storage.Deck{
		makePivotDeck(
			"Freddie",
			1,
			"2025-01-01",
			[]string{"B"},
			"control",
			[]types.Card{creature},
			[]types.Game{{Opponent: "Ozzy", Winner: "Freddie"}, {Opponent: "Debbie", Winner: "Freddie"}},
		),
		// 12-creature opponent lands in the "12-14" bucket.
		makePivotDeck("Ozzy", 1, "2025-01-01", []string{"G"}, "midrange", board, []types.Game{{Opponent: "Freddie", Winner: "Freddie"}}),
		// No mainboard recorded: contributes no composition column.
		makePivotDeck("Debbie", 1, "2025-01-01", []string{"W"}, "aggro", nil, []types.Game{{Opponent: "Freddie", Winner: "Freddie"}}),
	}

	resp := computePivot(decks, decks, &PivotRequest{
		GroupBy: dim("color", 1, "inclusive"),
		SplitBy: dim("opponent_creatures", 0, ""),
	}, nil, nil)

	blackRow := rowByKey(resp, "B")
	require.NotNil(t, blackRow)
	require.NotNil(t, blackRow.Cells["12-14"])
	assert.Equal(t, 1, blackRow.Cells["12-14"].Wins)
	assert.Equal(t, 2, blackRow.Cells[""].Wins, "overall column still counts the empty-mainboard opponent")

	// Columns: overall, "0-8" (Freddie as Ozzy's opponent), "12-14" (Ozzy as
	// Freddie's opponent). Debbie's empty mainboard adds no zero bucket.
	assert.Equal(t, []string{"", "0-8", "12-14"}, resp.Columns)

	byArch := computePivot(decks, decks, &PivotRequest{
		GroupBy: dim("color", 1, "inclusive"),
		SplitBy: dim("opponent_archetype", 0, ""),
	}, nil, nil)
	blackRow = rowByKey(byArch, "B")
	require.NotNil(t, blackRow)
	require.NotNil(t, blackRow.Cells["midrange"])
	assert.Equal(t, 1, blackRow.Cells["midrange"].Wins)
	require.NotNil(t, blackRow.Cells["aggro"])
	assert.Equal(t, 1, blackRow.Cells["aggro"].Wins)
}

func TestPivotPlayGroup(t *testing.T) {
	joan := makePivotDeck("Joan", 1, "2025-01-01", []string{"R"}, "aggro", nil, []types.Game{{Opponent: "Ozzy", Winner: "Joan"}, {Opponent: "Stevie", Winner: "Joan"}})
	joan.PlayGroup = "The Crew"
	stevie := makePivotDeck("Stevie", 1, "2025-01-01", []string{"G"}, "midrange", nil, []types.Game{{Opponent: "Joan", Winner: "Joan"}})
	stevie.PlayGroup = "The Crew"
	ozzy := makePivotDeck("Ozzy", 1, "2025-01-01", []string{"B"}, "control", nil, []types.Game{{Opponent: "Joan", Winner: "Joan"}})
	decks := []*storage.Deck{joan, stevie, ozzy}

	resp := computePivot(decks, decks, &PivotRequest{
		GroupBy: dim("playgroup", 0, ""),
		SplitBy: dim("opponent_playgroup", 0, ""),
	}, nil, nil)

	crew := rowByKey(resp, "The Crew")
	require.NotNil(t, crew)
	assert.Equal(t, 2, crew.Cells[""].Wins)
	assert.Equal(t, 1, crew.Cells[""].Losses)
	require.NotNil(t, crew.Cells["Everyone else"])
	assert.Equal(t, 1, crew.Cells["Everyone else"].Wins, "Joan beat Ozzy, the one deck in no group")

	rest := rowByKey(resp, "Everyone else")
	require.NotNil(t, rest)
	assert.Equal(t, 1, rest.Cells[""].Losses)

	p := PivotPredicate{Dim: "playgroup", Op: "eq", Value: "the crew"}
	assert.True(t, predicatePasses(joan, p, nil, nil))
	assert.False(t, predicatePasses(ozzy, p, nil, nil))
}

func TestPivotCardQueryPackage(t *testing.T) {
	pkgs, err := graveyardPackages("testcube")
	require.NoError(t, err)
	ozzy := queryDeck(1, "2026-01-10", "gy1", "gy2", "gy3")
	stevie := queryDeck(2, "2026-01-10", "gy1", "gy2", "Forest")
	p := PivotPredicate{Dim: "card_query", Op: "includes", Value: "package:graveyard"}

	assert.True(t, predicatePasses(ozzy, p, nil, pkgs))
	assert.False(t, predicatePasses(stevie, p, nil, pkgs))
	assert.False(t, predicatePasses(ozzy, p, nil, nil), "without the packages no deck builds one")
}

// sixAndOh is one mono-red deck for the player that won all six games.
func sixAndOh(player string) *storage.Deck {
	var games []types.Game
	for range 6 {
		games = append(games, types.Game{Opponent: "Ozzy", Winner: player})
	}
	return makePivotDeck(player, 1, "2025-01-01", []string{"R"}, "aggro", nil, games)
}

func TestPivotCell_HasBayes(t *testing.T) {
	decks := []*storage.Deck{sixAndOh("Joan")}
	resp := computePivot(decks, decks, &PivotRequest{GroupBy: dim("color", 1, "exact")}, nil, nil)
	r := rowByKey(resp, "R")
	require.NotNil(t, r)
	cell := r.Cells[""]
	assert.Equal(t, 100.0, cell.WinPercent)
	assert.Less(t, cell.BayesianWinPercent, 70.0, "six games shouldn't read as a sure thing")
	assert.Greater(t, cell.BayesianWinPercent, 50.0)
}

func TestPivotCell_DrawsOnly(t *testing.T) {
	d := makePivotDeck("Joan", 1, "2025-01-01", []string{"R"}, "aggro", nil, []types.Game{{Opponent: "Ozzy", Tie: true}, {Opponent: "Ozzy", Tie: true}})
	resp := computePivot([]*storage.Deck{d}, []*storage.Deck{d}, &PivotRequest{GroupBy: dim("color", 1, "exact")}, nil, nil)
	cell := rowByKey(resp, "R").Cells[""]
	assert.InDelta(t, 50.0, cell.BayesianWinPercent, 0.01)
	assert.False(t, math.IsNaN(cell.WinPercentLow))
	assert.False(t, math.IsNaN(cell.WinPercentHigh))
}

// TestPivot_PlayerRowsSortByBayes checks that rows without a natural order
// rank by Bayes, so a 6-0 newcomer doesn't outrank a long winning record.
func TestPivot_PlayerRowsSortByBayes(t *testing.T) {
	var long []types.Game
	for i := range 40 {
		winner := "Stevie"
		if i%4 == 0 {
			winner = "Ozzy"
		}
		long = append(long, types.Game{Opponent: "Ozzy", Winner: winner})
	}
	decks := []*storage.Deck{
		sixAndOh("Joan"),
		makePivotDeck("Stevie", 1, "2025-01-01", []string{"G"}, "midrange", nil, long),
	}
	resp := computePivot(decks, decks, &PivotRequest{GroupBy: dim("player", 0, "")}, nil, nil)
	require.GreaterOrEqual(t, len(resp.Rows), 2)
	assert.Equal(t, "Stevie", resp.Rows[0].Key, "30-10 ranks above 6-0 on Bayes")
}
