package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestZForConfidence_KnownValues(t *testing.T) {
	assert.InDelta(t, 1.2816, zForConfidence(0.80), 0.001)
	assert.InDelta(t, 1.6449, zForConfidence(0.90), 0.001)
	assert.InDelta(t, 1.9600, zForConfidence(0.95), 0.001)
	assert.InDelta(t, 2.5758, zForConfidence(0.99), 0.001)
}

func TestZForConfidence_FallsBackToDefault(t *testing.T) {
	// Unset or nonsensical levels resolve to defaultConfidence (0.80).
	def := zForConfidence(defaultConfidence)
	assert.InDelta(t, def, zForConfidence(0), 0.0001)
	assert.InDelta(t, def, zForConfidence(-1), 0.0001)
	assert.InDelta(t, def, zForConfidence(1), 0.0001)
	assert.InDelta(t, def, zForConfidence(1.5), 0.0001)
}

func TestWilsonInterval_NoGames(t *testing.T) {
	low, high := wilsonInterval(0, 0, 0, zForConfidence(0.95))
	assert.Equal(t, 0.0, low)
	assert.Equal(t, 0.0, high)
}

func TestWilsonInterval_ContainsPointEstimate(t *testing.T) {
	// 3-1 at 95%: point estimate 75%, interval ~30.1 to ~95.4.
	low, high := wilsonInterval(3, 1, 0, zForConfidence(0.95))
	assert.InDelta(t, 30.1, low, 0.2)
	assert.InDelta(t, 95.4, high, 0.2)
	assert.Less(t, low, 75.0)
	assert.Greater(t, high, 75.0)
}

func TestWilsonInterval_DrawsCountAsHalfWin(t *testing.T) {
	// A pile of draws should center the interval on 50%.
	low, high := wilsonInterval(0, 0, 40, zForConfidence(0.90))
	assert.Less(t, low, 50.0)
	assert.Greater(t, high, 50.0)
	assert.InDelta(t, 50.0, (low+high)/2, 0.1)
}

func TestWilsonInterval_HigherConfidenceWidens(t *testing.T) {
	low80, high80 := wilsonInterval(12, 8, 0, zForConfidence(0.80))
	low99, high99 := wilsonInterval(12, 8, 0, zForConfidence(0.99))
	assert.Less(t, low99, low80)
	assert.Greater(t, high99, high80)
}

func TestSetInterval_SignificanceTracksConfidence(t *testing.T) {
	// 18-2 is a strong signal: significant at a lenient bar, and staying
	// significant as we tighten it since the lower bound sits well above 50%.
	lenient := Record{Wins: 18, Losses: 2}
	lenient.Finalize()
	lenient.SetInterval(zForConfidence(0.80))
	assert.True(t, lenient.Significant)
	assert.Greater(t, lenient.WinPercentLow, 50.0)

	// A near coin-flip record never clears the bar.
	coinFlip := Record{Wins: 11, Losses: 9}
	coinFlip.Finalize()
	coinFlip.SetInterval(zForConfidence(0.95))
	assert.False(t, coinFlip.Significant)
	assert.Less(t, coinFlip.WinPercentLow, 50.0)
	assert.Greater(t, coinFlip.WinPercentHigh, 50.0)
}

func TestSetInterval_NoGamesNotSignificant(t *testing.T) {
	r := Record{}
	r.Finalize()
	r.SetInterval(zForConfidence(0.95))
	assert.False(t, r.Significant)
}
