package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// makePivotDeck builds a storage deck with everything the pivot engine reads:
// colors, archetype, mainboard (for composition), a draft ID + date (for
// opponent matching and time buckets), and a flattened Games slice.
func makePivotDeck(player, draftID, date string, colors []string, arch string, mainboard []types.Card, games []types.Game) *storage.Deck {
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
	return PivotDimension{Dim: name, Granularity: gran, ColorMode: mode}
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
		makePivotDeck("Alice", "d1", "2025-01-01", []string{"W", "B"}, "midrange",
			[]types.Card{{Name: "wc", Colors: []string{"W"}}, {Name: "bc", Colors: []string{"B"}}},
			[]types.Game{{Opponent: "Bob", Winner: "Alice"}, {Opponent: "Bob", Winner: "Alice"}}),
		// Mono-white deck, even.
		makePivotDeck("Carol", "d1", "2025-01-01", []string{"W"}, "aggro",
			[]types.Card{{Name: "wc", Colors: []string{"W"}}},
			[]types.Game{{Opponent: "Dave", Winner: "Carol"}, {Opponent: "Dave", Winner: "Dave"}}),
	}

	group := dim("color", 1, "inclusive")

	// Without the predicate, White is propped up by the WB deck: 3-1.
	all := computePivot(decks, &PivotRequest{GroupBy: group}, nil)
	w := rowByKey(all, "W")
	require.NotNil(t, w)
	assert.Equal(t, 3, w.Cells[""].Wins)
	assert.Equal(t, 1, w.Cells[""].Losses)
	assert.NotNil(t, rowByKey(all, "B"), "B row present when unfiltered")

	// Excluding black, only the mono-white deck remains: 1-1 (50%).
	filtered := computePivot(decks, &PivotRequest{
		GroupBy:    group,
		Predicates: []PivotPredicate{{Dim: "color", Op: "excludes", Value: "B"}},
	}, nil)
	w = rowByKey(filtered, "W")
	require.NotNil(t, w)
	assert.Equal(t, 1, w.Cells[""].Wins)
	assert.Equal(t, 1, w.Cells[""].Losses)
	assert.InDelta(t, 50.0, w.Cells[""].WinPct, 0.1)
	assert.Nil(t, rowByKey(filtered, "B"), "B row gone once black decks are excluded")
	assert.Equal(t, 1, w.Cells[""].Decks, "only the mono-white deck counts")
}

// Group by color at Dual granularity yields guild pairs.
func TestPivot_DualGuildPairs(t *testing.T) {
	decks := []*storage.Deck{
		makePivotDeck("Alice", "d1", "2025-01-01", []string{"W", "U"}, "control", nil,
			[]types.Game{{Opponent: "Bob", Winner: "Alice"}}),
		makePivotDeck("Carol", "d1", "2025-01-01", []string{"B", "G"}, "midrange", nil,
			[]types.Game{{Opponent: "Dave", Winner: "Eve"}}),
	}
	resp := computePivot(decks, &PivotRequest{GroupBy: dim("color", 2, "exact")}, nil)

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
		makePivotDeck("Alice", "d1", "2025-01-01", []string{"W"}, "", nil,
			[]types.Game{{Opponent: "Bob", Winner: "Alice"}}),
		makePivotDeck("Bob", "d1", "2025-01-01", []string{"R"}, "", nil,
			[]types.Game{{Opponent: "Alice", Winner: "Alice"}}),
	}
	resp := computePivot(decks, &PivotRequest{
		GroupBy: dim("color", 1, "inclusive"),
		SplitBy: dim("opponent_color", 1, "inclusive"),
	}, nil)

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

// A numeric composition predicate filters on the per-deck count.
func TestPivot_CompositionPredicate(t *testing.T) {
	removalCard := types.Card{Name: "Doom Blade", Colors: []string{"B"}, OracleText: "Destroy target creature."}
	vanilla := types.Card{Name: "Bear", Colors: []string{"B"}, Types: []string{"Creature"}, OracleText: "A bear."}

	decks := []*storage.Deck{
		// 3 removal spells - passes removal >= 3.
		makePivotDeck("Alice", "d1", "2025-01-01", []string{"B"}, "control",
			[]types.Card{removalCard, removalCard, removalCard, vanilla},
			[]types.Game{{Opponent: "Bob", Winner: "Alice"}}),
		// 0 removal - filtered out.
		makePivotDeck("Carol", "d1", "2025-01-01", []string{"B"}, "aggro",
			[]types.Card{vanilla, vanilla},
			[]types.Game{{Opponent: "Dave", Winner: "Dave"}}),
	}
	resp := computePivot(decks, &PivotRequest{
		GroupBy:    dim("color", 1, "inclusive"),
		Predicates: []PivotPredicate{{Dim: "removal", Op: "gte", Value: "3"}},
	}, nil)

	b := rowByKey(resp, "B")
	require.NotNil(t, b)
	assert.Equal(t, 1, b.Cells[""].Wins)
	assert.Equal(t, 0, b.Cells[""].Losses)
	assert.Equal(t, 1, b.Cells[""].Decks, "only the removal-heavy deck counts")
}

// Grouping by time yields one row per bucket, labeled by the bucket's start date.
func TestPivot_TimeGrouping(t *testing.T) {
	decks := []*storage.Deck{
		makePivotDeck("Alice", "2025-01-01_a", "2025-01-01", []string{"R"}, "", nil,
			[]types.Game{{Opponent: "Bob", Winner: "Alice"}}),
		makePivotDeck("Carol", "2025-02-01_b", "2025-02-01", []string{"R"}, "", nil,
			[]types.Game{{Opponent: "Dave", Winner: "Dave"}}),
	}
	resp := computePivot(decks, &PivotRequest{GroupBy: dim("time", 0, ""), BucketSize: 1}, nil)

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
		makePivotDeck("Alice", "d1", "2025-01-01", []string{"W"}, "", nil, []types.Game{
			{Opponent: "Bob", Winner: "Alice"},   // dropped: vs excluded Bob
			{Opponent: "Carol", Winner: "Carol"}, // kept: Alice loss
		}),
		makePivotDeck("Bob", "d1", "2025-01-01", []string{"R"}, "", nil, []types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Carol", Winner: "Bob"},
		}),
		makePivotDeck("Carol", "d1", "2025-01-01", []string{"U"}, "", nil, []types.Game{
			{Opponent: "Alice", Winner: "Carol"}, // kept: Carol win
			{Opponent: "Bob", Winner: "Bob"},     // dropped: vs excluded Bob
		}),
	}
	resp := computePivot(decks, &PivotRequest{
		GroupBy:        dim("color", 1, "inclusive"),
		ExcludePlayers: []string{"bob"}, // case-insensitive
	}, nil)

	assert.Nil(t, rowByKey(resp, "R"), "excluded player's own deck is gone")

	w := rowByKey(resp, "W")
	require.NotNil(t, w)
	assert.Equal(t, 0, w.Cells[""].Wins)
	assert.Equal(t, 1, w.Cells[""].Losses) // only the vs-Carol game survives

	u := rowByKey(resp, "U")
	require.NotNil(t, u)
	assert.Equal(t, 1, u.Cells[""].Wins) // only the vs-Alice game survives
	assert.Equal(t, 0, u.Cells[""].Losses)
}

// composition counts nonland cards by classifier and reports the land count and
// average mana value separately.
func TestComposition(t *testing.T) {
	d := &storage.Deck{}
	d.Mainboard = []types.Card{
		{Name: "Doom Blade", OracleText: "Destroy target creature.", CMC: 2},
		{Name: "Counterspell", OracleText: "Counter target spell.", CMC: 2},
		{Name: "Bear", Types: []string{"Creature"}, OracleText: "grr", CMC: 4},
		{Name: "Island", Types: []string{"Basic", "Land"}},
	}
	comp := composition(d, nil)
	assert.Equal(t, 1, comp.Removal)
	assert.Equal(t, 2, comp.Interaction) // removal + counterspell
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
		makePivotDeck("Alice", "d1", "2025-01-01", []string{"B"}, "control", []types.Card{creature},
			[]types.Game{{Opponent: "Bob", Winner: "Alice"}, {Opponent: "Carol", Winner: "Alice"}}),
		// 12-creature opponent lands in the "12-14" bucket.
		makePivotDeck("Bob", "d1", "2025-01-01", []string{"G"}, "midrange", board,
			[]types.Game{{Opponent: "Alice", Winner: "Alice"}}),
		// No mainboard recorded: contributes no composition column.
		makePivotDeck("Carol", "d1", "2025-01-01", []string{"W"}, "aggro", nil,
			[]types.Game{{Opponent: "Alice", Winner: "Alice"}}),
	}

	resp := computePivot(decks, &PivotRequest{
		GroupBy: dim("color", 1, "inclusive"),
		SplitBy: dim("opponent_creatures", 0, ""),
	}, nil)

	b := rowByKey(resp, "B")
	require.NotNil(t, b)
	require.NotNil(t, b.Cells["12-14"])
	assert.Equal(t, 1, b.Cells["12-14"].Wins)
	assert.Equal(t, 2, b.Cells[""].Wins, "overall column still counts the empty-mainboard opponent")
	// Columns: overall, "0-8" (Alice as Bob's opponent), "12-14" (Bob as
	// Alice's opponent). Carol's empty mainboard adds no zero bucket.
	assert.Equal(t, []string{"", "0-8", "12-14"}, resp.Columns)

	byArch := computePivot(decks, &PivotRequest{
		GroupBy: dim("color", 1, "inclusive"),
		SplitBy: dim("opponent_archetype", 0, ""),
	}, nil)
	b = rowByKey(byArch, "B")
	require.NotNil(t, b)
	require.NotNil(t, b.Cells["midrange"])
	assert.Equal(t, 1, b.Cells["midrange"].Wins)
	require.NotNil(t, b.Cells["aggro"])
	assert.Equal(t, 1, b.Cells["aggro"].Wins)
}
