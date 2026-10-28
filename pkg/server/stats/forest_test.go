package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// forestRow returns the row for key, failing the test when it's missing.
func forestRow(t *testing.T, rows []*ForestRow, key string) *ForestRow {
	t.Helper()
	for _, r := range rows {
		if r.Key == key {
			return r
		}
	}
	require.Failf(t, "missing row", "no forest row %q", key)
	return nil
}

// climbingDecks returns four decks whose win rate rises with creature count:
// 0 creatures go 1-3, 1 goes 2-2, 2 go 3-1 and 3 go 4-0.
func climbingDecks() []*storage.Deck {
	var decks []*storage.Deck
	for i := 0; i < 4; i++ {
		decks = append(decks, recordDeck("Ozzy", append(creatures(i), basicLand()), i+1, 3-i))
	}
	return decks
}

func TestForestRows_PositiveSlope(t *testing.T) {
	row := forestRow(t, forestRows(climbingDecks(), 1.96), "creatures")
	assert.True(t, row.HasEffect)
	assert.Equal(t, 4, row.Decks)
	assert.Greater(t, row.Effect, 0.0)
}

func TestForestRows_ZeroSpread(t *testing.T) {
	decks := []*storage.Deck{
		recordDeck("Ozzy", creatures(2), 3, 1),
		recordDeck("Stevie", creatures(2), 1, 3),
		recordDeck("Joan", creatures(2), 2, 2),
	}
	row := forestRow(t, forestRows(decks, 1.96), "creatures")
	assert.False(t, row.HasEffect)
	assert.Equal(t, 0.0, row.Effect)
}

func TestForestRows_SkipsDecksWithoutDecklist(t *testing.T) {
	want := forestRow(t, forestRows(climbingDecks(), 1.96), "creatures")

	decks := append(climbingDecks(), recordDeck("Freddie", nil, 10, 0))
	got := forestRow(t, forestRows(decks, 1.96), "creatures")
	assert.Equal(t, 4, got.Decks)
	assert.Equal(t, want.Effect, got.Effect)
}

func TestForestRows_SkipsDecksWithoutGames(t *testing.T) {
	decks := append(climbingDecks(), recordDeck("Freddie", creatures(9), 0, 0))
	row := forestRow(t, forestRows(decks, 1.96), "creatures")
	assert.Equal(t, 4, row.Decks)
}

func TestForestRows_KnownSlope(t *testing.T) {
	// Win rate climbs exactly 10 points per creature, so the fit has no
	// residual and the interval collapses onto the effect.
	var decks []*storage.Deck
	for i := 0; i < 5; i++ {
		decks = append(decks, recordDeck("Ozzy", append(creatures(i), basicLand()), 3+i, 7-i))
	}
	row := forestRow(t, forestRows(decks, 1.96), "creatures")
	assert.Equal(t, 15.8, row.Effect)
	assert.Equal(t, 15.8, row.EffectLow)
	assert.Equal(t, 15.8, row.EffectHigh)
	assert.Equal(t, 1.58, row.StdDev)
}

func TestForestRows_TooFewDecks(t *testing.T) {
	decks := climbingDecks()[:2]
	row := forestRow(t, forestRows(decks, 1.96), "creatures")
	assert.False(t, row.HasEffect)
}
