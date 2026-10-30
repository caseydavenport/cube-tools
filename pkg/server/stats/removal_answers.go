package stats

import (
	"cmp"
	"slices"
)

// manaColors are the five colors, in the order the Removal page shows them.
var manaColors = []string{"W", "U", "B", "R", "G"}

// removalColors are the rows of the Removal page's per-color table: the five
// colors, then "C" for colorless.
var removalColors = []string{"W", "U", "B", "R", "G", "C"}

// spotCard is one spot-removal card, by name, with its modes' kill conditions
// and the rows built from them. Most cards have one mode; kicker and revolt
// cards have several, but count as one card.
type spotCard struct {
	name   string
	colors []string
	modes  []RemovalProfile
	rows   []RemovalCard
}

// HardToRemoveRow is one cube creature and how many spot-removal cards can
// kill it. Answers[""] counts every such card; Answers["W"] and the other
// colors count only cards a deck of that color could play: that color's
// removal plus colorless removal.
type HardToRemoveRow struct {
	Name    string         `json:"name"`
	MV      int            `json:"mv"`
	Colors  []string       `json:"colors"`
	Answers map[string]int `json:"answers"`
}

// RemovalColorRow is how much spot removal one color has: how many cards, and
// the median share of creatures they can kill, raw and play-weighted. A
// multicolor card counts under each of its colors. A median is -1 when the
// color has no removal with a comparable coverage.
type RemovalColorRow struct {
	Color           string  `json:"color"`
	Cards           int     `json:"cards"`
	MedianPctCube   float64 `json:"median_pct_cube"`
	MedianPctPlayed float64 `json:"median_pct_played"`
}

// hardToRemove counts, for each creature, the spot-removal cards that can kill
// it, overall and per color, and lists the creatures fewest answers first.
// A card answers when any of its modes can kill the creature; scalable
// removal answers whenever its restrictions allow, since mana is the only limit.
// A creature the cube holds more than once gets one row.
func hardToRemove(cards []spotCard, creatures []creatureInfo) []HardToRemoveRow {
	rows := make([]HardToRemoveRow, 0, len(creatures))
	seen := map[string]bool{}
	for _, creature := range creatures {
		if seen[creature.name] {
			continue
		}
		seen[creature.name] = true

		numAnswers := map[string]int{"": 0}
		for _, color := range manaColors {
			numAnswers[color] = 0
		}
		for _, card := range cards {
			if !card.kills(creature) {
				continue
			}
			numAnswers[""]++
			for _, color := range manaColors {
				if card.playableIn(color) {
					numAnswers[color]++
				}
			}
		}
		rows = append(rows, HardToRemoveRow{Name: creature.name, MV: creature.mv, Colors: creature.colors, Answers: numAnswers})
	}

	slices.SortFunc(rows, func(a, b HardToRemoveRow) int {
		if a.Answers[""] != b.Answers[""] {
			return a.Answers[""] - b.Answers[""]
		}
		if a.MV != b.MV {
			return b.MV - a.MV
		}
		return cmp.Compare(a.Name, b.Name)
	})
	return rows
}

// kills reports whether any of the card's modes can kill the creature.
func (c spotCard) kills(creature creatureInfo) bool {
	for _, mode := range c.modes {
		if mode.killable(creature) {
			return true
		}
	}
	return false
}

// playableIn reports whether a deck of the given color can play the card:
// the card has that color, or no color at all.
func (c spotCard) playableIn(color string) bool {
	return len(c.colors) == 0 || hasColor(c.colors, color)
}

// removalByColor summarizes spot removal per color, in removalColors order.
// Medians use each card's best mode and skip scalable cards, which have no
// coverage to compare.
func removalByColor(cards []spotCard) []RemovalColorRow {
	rows := make([]RemovalColorRow, 0, len(removalColors))
	for _, color := range removalColors {
		row := RemovalColorRow{Color: color}
		var cube, played []float64
		for _, card := range cards {
			if !card.inColorRow(color) {
				continue
			}
			row.Cards++
			bestCube, bestPlayed, ok := card.bestCoverage()
			if ok {
				cube = append(cube, bestCube)
				played = append(played, bestPlayed)
			}
		}
		row.MedianPctCube = median(cube)
		row.MedianPctPlayed = median(played)
		rows = append(rows, row)
	}
	return rows
}

// inColorRow reports whether the card belongs in the given color's
// row: "C" holds colorless cards, and each color holds cards of that color.
func (c spotCard) inColorRow(color string) bool {
	if color == "C" {
		return len(c.colors) == 0
	}
	return hasColor(c.colors, color)
}

// bestCoverage returns the card's highest raw and play-weighted coverage over
// its non-scalable modes, and false when every mode is scalable.
func (c spotCard) bestCoverage() (float64, float64, bool) {
	bestCube, bestPlayed, found := 0.0, 0.0, false
	for _, row := range c.rows {
		if row.Scalable {
			continue
		}
		found = true
		bestCube = max(bestCube, row.PctCube)
		bestPlayed = max(bestPlayed, row.PctPlayed)
	}
	return bestCube, bestPlayed, found
}

// median returns the middle value, the mean of the two middle values for an
// even count, or -1 for no values. It rounds to one decimal place.
func median(values []float64) float64 {
	if len(values) == 0 {
		return -1
	}
	sorted := slices.Sorted(slices.Values(values))
	mid := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return round1(sorted[mid])
	}
	return round1((sorted[mid-1] + sorted[mid]) / 2)
}
