package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestRecord_WinPercent_NoDraws(t *testing.T) {
	r := Record{Wins: 3, Losses: 1}
	r.Finalize()
	assert.InDelta(t, 75.0, r.WinPercent, 0.01)
}

func TestRecord_WinPercent_DrawsCountAsHalfWin(t *testing.T) {
	// 2 wins, 1 loss, 1 draw → (2 + 0.5) / 4 = 62.5%
	r := Record{Wins: 2, Losses: 1, Draws: 1}
	r.Finalize()
	assert.InDelta(t, 62.5, r.WinPercent, 0.01)
}

func TestRecord_WinPercent_AllDraws(t *testing.T) {
	// All draws → 50%
	r := Record{Draws: 4}
	r.Finalize()
	assert.InDelta(t, 50.0, r.WinPercent, 0.01)
}

func TestRecord_WinPercent_NoGames(t *testing.T) {
	r := Record{}
	r.Finalize()
	assert.Equal(t, 0.0, r.WinPercent)
}

func TestRecord_WinPercent_DrawDenominatorHurts(t *testing.T) {
	// A 2-0-3 deck should not show as 100%. Draws drag the rate down
	// because they sit at 50%, not "ignored".
	r := Record{Wins: 2, Losses: 0, Draws: 3}
	r.Finalize()

	// (2 + 1.5) / 5 = 70%
	assert.InDelta(t, 70.0, r.WinPercent, 0.01)
}

func TestRecord_AddFoldsDeckGames(t *testing.T) {
	deck := makePivotDeck("Freddie", 1, "2025-01-01", []string{"R"}, "", nil, []types.Game{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Ozzy", Winner: "Ozzy"},
		{Opponent: "Ozzy", Tie: true},
	})
	r := Record{}
	r.Add(deck)
	r.Add(deck)
	assert.Equal(t, Record{Wins: 2, Losses: 2, Draws: 2}, r)
}

func TestRecord_SetBayesianShrinksTowardFifty(t *testing.T) {
	r := Record{Wins: 6}
	r.Finalize()
	r.SetBayesian(10)
	assert.Equal(t, 100.0, r.WinPercent)
	assert.Greater(t, r.BayesianWinPercent, 50.0)
	assert.Less(t, r.BayesianWinPercent, r.WinPercent)

	smallPrior := Record{Wins: 6}
	smallPrior.SetBayesian(1)
	assert.Greater(t, smallPrior.BayesianWinPercent, r.BayesianWinPercent, "a smaller prior shrinks less")
}
