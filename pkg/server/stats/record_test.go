package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"
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
