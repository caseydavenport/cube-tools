package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// spell returns a mainboard card of one type with the given mana value and text.
func spell(cardType string, cmc int, oracle string) types.Card {
	return types.Card{Name: oracle, Types: []string{cardType}, CMC: cmc, OracleText: oracle}
}

// basicLand returns a basic Plains.
func basicLand() types.Card {
	return types.Card{Name: "Plains", Types: []string{"Basic", "Land"}}
}

// nonbasicLand returns a nonbasic land with no text.
func nonbasicLand() types.Card {
	return types.Card{Name: "Ancient Tomb", Types: []string{"Land"}}
}

// creatures returns n vanilla two-drop creatures.
func creatures(n int) []types.Card {
	var out []types.Card
	for i := 0; i < n; i++ {
		out = append(out, spell("Creature", 2, ""))
	}
	return out
}

// recordDeck returns a draft 1 deck with the given mainboard and one match
// record of wins and losses against an unnamed opponent.
func recordDeck(player string, mainboard []types.Card, wins, losses int) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = 1
	d.Mainboard = mainboard
	d.Matches = []types.Match{{Wins: wins, Losses: losses}}
	return d
}

// featureValue looks up a forest feature by key and returns its value for d.
func featureValue(t *testing.T, key string, d *storage.Deck) float64 {
	t.Helper()
	for _, f := range forestFeatures {
		if f.Key == key {
			return f.Value(d)
		}
	}
	require.Failf(t, "unknown feature", "no forest feature %q", key)
	return 0
}

func TestForestFeatures_Values(t *testing.T) {
	d := recordDeck("Ozzy", []types.Card{
		spell("Creature", 2, ""),
		spell("Creature", 4, ""),
		spell("Instant", 1, "Counter target spell."),
		spell("Sorcery", 3, "Destroy target creature."),
		basicLand(),
		nonbasicLand(),
	}, 0, 0)

	assert.Equal(t, 2.5, featureValue(t, "avg_mana_value", d))
	assert.Equal(t, 2.0, featureValue(t, "creatures", d))
	assert.Equal(t, 1.0, featureValue(t, "instants", d))
	assert.Equal(t, 1.0, featureValue(t, "sorceries", d))
	assert.Equal(t, 2.0, featureValue(t, "lands", d))
	assert.Equal(t, 1.0, featureValue(t, "nonbasic_lands", d))
	assert.Equal(t, 1.0, featureValue(t, "removal", d))
	assert.Equal(t, 1.0, featureValue(t, "counterspells", d))
	assert.Equal(t, 0.0, featureValue(t, "planeswalkers", d))
	assert.Equal(t, 2.0, interactionFeature.Value(d))
}

func TestForestFeatures_Order(t *testing.T) {
	var keys []string
	for _, f := range forestFeatures {
		keys = append(keys, f.Key)
	}
	assert.Equal(t, []string{
		"avg_mana_value", "creatures", "sorceries", "instants", "planeswalkers",
		"enchantments", "lands", "nonbasic_lands", "colors", "removal",
		"counterspells", "card_draw", "lifegain", "graveyard", "discard",
	}, keys)
}

func TestForestFeatures_AvgManaValueWithoutSpells(t *testing.T) {
	d := recordDeck("Ozzy", []types.Card{basicLand()}, 0, 0)
	assert.Equal(t, 0.0, featureValue(t, "avg_mana_value", d))
}
