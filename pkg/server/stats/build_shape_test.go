package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// macroDeck returns a deck with the given macro archetype and mainboard.
func macroDeck(macro string, mainboard []types.Card) *storage.Deck {
	d := recordDeck("Ozzy", mainboard, 1, 1)
	d.MacroArchetype = macro
	return d
}

// coloredCards returns n creatures with mana cost cost and the given colors.
func coloredCards(n int, cost string, colors ...string) []types.Card {
	var out []types.Card
	for i := 0; i < n; i++ {
		out = append(out, types.Card{Types: []string{"Creature"}, ManaCost: cost, Colors: colors})
	}
	return out
}

// curveRow returns the mana curve row for archetype.
func curveRow(t *testing.T, rows []*CurveRow, archetype string) *CurveRow {
	t.Helper()
	for _, r := range rows {
		if r.Archetype == archetype {
			return r
		}
	}
	require.Failf(t, "missing row", "no curve row %q", archetype)
	return nil
}

// splashBucket returns the splash bucket labeled label.
func splashBucket(t *testing.T, buckets []*SplashBucket, label string) *SplashBucket {
	t.Helper()
	for _, b := range buckets {
		if b.Label == label {
			return b
		}
	}
	require.Failf(t, "missing bucket", "no splash bucket %q", label)
	return nil
}

func TestManaCurve_AveragesPerDeck(t *testing.T) {
	decks := []*storage.Deck{
		macroDeck("aggro", append(spellsAt(1, 1), basicLand())),
		macroDeck("aggro", spellsAt(1, 7)),
	}
	row := curveRow(t, manaCurve(decks), "aggro")
	assert.Equal(t, 2, row.Decks)
	assert.Equal(t, []float64{0, 1.5, 0, 0, 0, 0, 0, 0.5}, row.Counts)
}

func TestManaCurve_SkipsDecksWithoutMacro(t *testing.T) {
	rows := manaCurve([]*storage.Deck{macroDeck("", spellsAt(2))})
	require.Len(t, rows, 3)
	for _, r := range rows {
		assert.Equal(t, 0, r.Decks)
	}
}

func TestManaCurve_SkipsDecksWithoutDecklist(t *testing.T) {
	row := curveRow(t, manaCurve([]*storage.Deck{macroDeck("aggro", nil)}), "aggro")
	assert.Equal(t, 0, row.Decks)
	assert.Equal(t, make([]float64, 8), row.Counts)
}

func TestTypeMix_ArtifactCreatureCountsTwice(t *testing.T) {
	golem := types.Card{Types: []string{"Artifact", "Creature"}, CMC: 3}
	rows := typeMix([]*storage.Deck{macroDeck("control", []types.Card{golem, basicLand()})})

	var control *TypeMixRow
	for _, r := range rows {
		if r.Archetype == "control" {
			control = r
		}
	}
	require.NotNil(t, control)
	assert.Equal(t, 1.0, control.Counts["Creature"])
	assert.Equal(t, 1.0, control.Counts["Artifact"])
	assert.Equal(t, 0.0, control.Counts["Instant"])
	assert.Len(t, control.Counts, 6)
}

func TestSplashSize_CountsOffColorCards(t *testing.T) {
	base := append(coloredCards(8, "{W}", "W"), coloredCards(8, "{U}", "U")...)

	splashing := recordDeck("Ozzy", append(append([]types.Card{}, base...), coloredCards(1, "{R}", "R")...), 2, 1)
	hybrid := recordDeck("Stevie", append(append([]types.Card{}, base...), coloredCards(1, "{W/R}", "W", "R")...), 1, 2)
	artifact := recordDeck("Joan", append(append([]types.Card{}, base...), spell("Artifact", 2, "")), 1, 1)

	buckets := splashSize([]*storage.Deck{splashing, hybrid, artifact}, 1.96)
	assert.Equal(t, 1, splashBucket(t, buckets, "1").Decks)
	assert.Equal(t, 2, splashBucket(t, buckets, "1").Wins)
	assert.Equal(t, 2, splashBucket(t, buckets, "0").Decks)
}

func TestSplashSize_GoldCardWithOffColorIsSplash(t *testing.T) {
	// A WR gold card needs red mana, so a WU deck playing it splashes, even
	// though one of its colors is primary.
	base := append(coloredCards(8, "{W}", "W"), coloredCards(8, "{U}", "U")...)
	gold := recordDeck("Ozzy", append(base, coloredCards(1, "{R}{W}", "R", "W")...), 1, 0)

	buckets := splashSize([]*storage.Deck{gold}, 1.96)
	assert.Equal(t, 1, splashBucket(t, buckets, "1").Decks)
}

func TestSplashSize_MonoColorIsZero(t *testing.T) {
	mono := recordDeck("Ozzy", coloredCards(5, "{R}", "R"), 1, 0)
	buckets := splashSize([]*storage.Deck{mono}, 1.96)
	assert.Equal(t, 1, splashBucket(t, buckets, "0").Decks)
}

func TestSplashSize_SkipsEvenThreeColorDecks(t *testing.T) {
	cards := append(append(coloredCards(6, "{W}", "W"), coloredCards(6, "{U}", "U")...), coloredCards(6, "{R}", "R")...)
	buckets := splashSize([]*storage.Deck{recordDeck("Ozzy", cards, 1, 0)}, 1.96)

	var labels []string
	total := 0
	for _, b := range buckets {
		labels = append(labels, b.Label)
		total += b.Decks
	}
	assert.Equal(t, []string{"0", "1", "2", "3", "4+"}, labels)
	assert.Equal(t, 0, total)
}
