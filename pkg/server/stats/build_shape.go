package stats

import (
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// curveBuckets is how many mana values the curve chart shows: 0 through 6,
// then one bucket for 7 and up.
const curveBuckets = 8

// mixTypes are the card types the type mix chart stacks, in order.
var mixTypes = []string{"Creature", "Instant", "Sorcery", "Enchantment", "Artifact", "Planeswalker"}

// splashLabels name the splash size buckets; the last holds 4 or more cards.
var splashLabels = []string{"0", "1", "2", "3", "4+"}

// CurveRow is one line of the mana curve chart: a macro archetype's average
// number of nonland cards at each mana value, with 7 and up in the last slot.
type CurveRow struct {
	Archetype string    `json:"archetype"`
	Decks     int       `json:"decks"`
	Counts    []float64 `json:"counts"`
}

// TypeMixRow is one bar of the type mix chart: a macro archetype's average
// number of nonland cards of each type in mixTypes.
type TypeMixRow struct {
	Archetype string             `json:"archetype"`
	Decks     int                `json:"decks"`
	Counts    map[string]float64 `json:"counts"`
}

// SplashBucket is one bar of the splash size chart: the decks with Label
// cards outside their primary colors, and their combined record.
type SplashBucket struct {
	Record
	Label string `json:"label"`
	Decks int    `json:"decks"`
}

// macroDecks groups the decks that have a decklist and a macro archetype by
// that archetype.
func macroDecks(decks []*storage.Deck) map[string][]*storage.Deck {
	groups := make(map[string][]*storage.Deck)
	for _, d := range decks {
		if !hasDecklist(d) || d.Macro() == "" {
			continue
		}
		groups[d.Macro()] = append(groups[d.Macro()], d)
	}
	return groups
}

// manaCurve averages each macro archetype's nonland cards per mana value.
func manaCurve(decks []*storage.Deck) []*CurveRow {
	groups := macroDecks(decks)
	rows := make([]*CurveRow, 0, len(macroArchetypes))
	for _, a := range macroArchetypes {
		row := &CurveRow{Archetype: a, Decks: len(groups[a]), Counts: make([]float64, curveBuckets)}
		for _, d := range groups[a] {
			for _, c := range d.Mainboard {
				if c.IsLand() {
					continue
				}
				row.Counts[min(c.CMC, curveBuckets-1)]++
			}
		}
		averageCounts(row.Counts, row.Decks)
		rows = append(rows, row)
	}
	return rows
}

// typeMix averages each macro archetype's nonland cards per card type. A card
// with two of the types counts toward both.
func typeMix(decks []*storage.Deck) []*TypeMixRow {
	groups := macroDecks(decks)
	rows := make([]*TypeMixRow, 0, len(macroArchetypes))
	for _, a := range macroArchetypes {
		counts := make([]float64, len(mixTypes))
		for _, d := range groups[a] {
			for _, c := range d.Mainboard {
				if c.IsLand() {
					continue
				}
				for i, t := range mixTypes {
					if slices.Contains(c.Types, t) {
						counts[i]++
					}
				}
			}
		}
		averageCounts(counts, len(groups[a]))

		row := &TypeMixRow{Archetype: a, Decks: len(groups[a]), Counts: make(map[string]float64, len(mixTypes))}
		for i, t := range mixTypes {
			row.Counts[t] = counts[i]
		}
		rows = append(rows, row)
	}
	return rows
}

// averageCounts divides each total by decks, rounded to two decimals. It
// leaves the totals alone when there are no decks, since they're all zero.
func averageCounts(totals []float64, decks int) {
	if decks == 0 {
		return
	}
	for i := range totals {
		totals[i] = round2(totals[i] / float64(decks))
	}
}

// splashSize buckets decks by how many cards they play outside their primary
// colors and records how each bucket did. Decks without a decklist, without
// known colors, or with three even colors are left out.
func splashSize(decks []*storage.Deck, z float64) []*SplashBucket {
	buckets := make([]*SplashBucket, 0, len(splashLabels))
	for _, label := range splashLabels {
		buckets = append(buckets, &SplashBucket{Label: label})
	}

	for _, d := range decks {
		if !hasDecklist(d) {
			continue
		}
		primary := primaryColors(d)
		if len(primary) == 0 {
			continue
		}
		b := buckets[min(splashCards(d, primary), len(buckets)-1)]
		b.Decks++
		b.Add(d)
	}

	for _, b := range buckets {
		b.Finalize()
		b.SetInterval(z)
	}
	return buckets
}

// primaryColors returns the colors a deck is built around: its one color for
// a mono-color deck, otherwise its primary pair. It's empty when the deck has
// no known colors or no clear pair.
func primaryColors(d *storage.Deck) types.ColorIdentity {
	if len(d.GetColors()) == 1 {
		return d.GetColors()
	}
	return d.PrimaryColorPair()
}

// splashCards counts the deck's nonland cards that have colors and none of
// them primary. A hybrid card with one primary half isn't a splash.
func splashCards(d *storage.Deck, primary types.ColorIdentity) int {
	count := 0
	for _, c := range d.Mainboard {
		if c.IsLand() || len(c.Colors) == 0 {
			continue
		}
		onColor := false
		for _, color := range c.Colors {
			if primary[color] {
				onColor = true
			}
		}
		if !onColor {
			count++
		}
	}
	return count
}
