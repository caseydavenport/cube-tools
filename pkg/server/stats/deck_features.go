package stats

import (
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// deckFeature is one number measured on a deck, such as its creature count.
// The Deck Stats charts compare decks by these: the forest plot fits win rate
// against each one, and head to head compares the two decks in a game.
type deckFeature struct {
	// Key names the feature in the JSON the UI reads.
	Key string

	// Value measures the feature on one deck's mainboard.
	Value func(d *storage.Deck) float64
}

// forestFeatures are the features the forest plot has a row for, in the order
// it shows them. They match the "Wins by #" charts the forest plot replaced.
var forestFeatures = []deckFeature{
	{Key: "avg_mana_value", Value: avgManaValue},
	{Key: "creatures", Value: typeCounter("Creature")},
	{Key: "sorceries", Value: typeCounter("Sorcery")},
	{Key: "instants", Value: typeCounter("Instant")},
	{Key: "planeswalkers", Value: typeCounter("Planeswalker")},
	{Key: "enchantments", Value: typeCounter("Enchantment")},
	{Key: "lands", Value: typeCounter("Land")},
	{Key: "nonbasic_lands", Value: cardCounter(isNonbasicLand)},
	{Key: "colors", Value: colorCount},
	{Key: "removal", Value: cardCounter(types.Card.IsRemoval)},
	{Key: "counterspells", Value: cardCounter(types.Card.IsCounterspell)},
	{Key: "card_draw", Value: cardCounter(types.Card.IsCardDraw)},
	{Key: "lifegain", Value: cardCounter(types.Card.IsLifegain)},
	{Key: "graveyard", Value: cardCounter(types.Card.IsGraveyard)},
	{Key: "discard", Value: cardCounter(types.Card.IsDiscard)},
}

// interactionFeature counts removal and counterspells together. Hand
// disruption is left out, matching how the browser counted interaction.
var interactionFeature = deckFeature{Key: "interaction", Value: cardCounter(isRemovalOrCounter)}

// hasDecklist reports whether the deck's mainboard is known. Decks recorded
// without a list have zero of everything, so the charts skip them.
func hasDecklist(d *storage.Deck) bool {
	return len(d.Mainboard) > 0
}

// cardCounter returns a feature value that counts the mainboard cards match
// accepts.
func cardCounter(match func(types.Card) bool) func(*storage.Deck) float64 {
	return func(d *storage.Deck) float64 {
		count := 0
		for _, c := range d.Mainboard {
			if match(c) {
				count++
			}
		}
		return float64(count)
	}
}

// typeCounter returns a feature value that counts mainboard cards with the
// given card type.
func typeCounter(cardType string) func(*storage.Deck) float64 {
	return cardCounter(func(c types.Card) bool {
		return slices.Contains(c.Types, cardType)
	})
}

// avgManaValue is the mean mana value of the deck's nonland mainboard cards,
// or 0 when it has none.
func avgManaValue(d *storage.Deck) float64 {
	total := 0
	count := 0
	for _, c := range d.Mainboard {
		if c.IsLand() {
			continue
		}
		total += c.CMC
		count++
	}
	if count == 0 {
		return 0
	}
	return float64(total) / float64(count)
}

// colorCount is the number of colors the deck plays.
func colorCount(d *storage.Deck) float64 {
	return float64(len(d.GetColors()))
}

// isNonbasicLand reports whether the card is a land that isn't a basic.
func isNonbasicLand(c types.Card) bool {
	return c.IsLand() && !c.IsBasicLand()
}

// isRemovalOrCounter reports whether the card is removal or a counterspell.
func isRemovalOrCounter(c types.Card) bool {
	return c.IsRemoval() || c.IsCounterspell()
}
