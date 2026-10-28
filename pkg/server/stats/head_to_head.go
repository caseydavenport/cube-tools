package stats

import (
	"math"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// macroArchetypes are the archetypes the Deck Stats charts split decks by, in
// the order the charts show them.
var macroArchetypes = []string{"aggro", "midrange", "control"}

// headToHeadFeatures are the features the head-to-head chart can compare.
var headToHeadFeatures = []deckFeature{manaValueFeature, creaturesFeature, interactionFeature}

// GapBucket is one bar of the head-to-head chart: the games where one deck
// had more of a feature than its opponent by about Label, and how the deck
// with more did in them.
type GapBucket struct {
	Record
	Label string `json:"label"`
}

// gapScale says how a feature's gaps are bucketed: in steps of step, one
// bucket per label, with the last bucket open-ended.
type gapScale struct {
	step   float64
	labels []string
}

var (
	manaValueGaps = gapScale{step: 0.25, labels: []string{"0.25", "0.5", "0.75", "1.0+"}}
	countGaps     = gapScale{step: 1, labels: []string{"1", "2", "3", "4", "5", "6+"}}
)

// index returns which bucket a positive gap falls in. Bucket i holds gaps up
// to (i+1)*step, and the last bucket holds everything beyond.
func (s gapScale) index(gap float64) int {
	// The small offset keeps a gap of exactly 0.5 from rounding up a bucket.
	i := int(math.Ceil(gap/s.step-1e-9)) - 1
	if last := len(s.labels) - 1; i >= last {
		return last
	}
	return i
}

// scaleFor picks the bucketing for a feature: quarter steps for average mana
// value, whole cards for everything else.
func scaleFor(f deckFeature) gapScale {
	if f.Key == "avg_mana_value" {
		return manaValueGaps
	}
	return countGaps
}

// headToHead buckets the games of decks by how much more of feature the deck
// had than its opponent, and records how the deck with more did. Opponents are
// looked up in allDecks, so a filter on decks still counts games against
// everyone. Each game is counted once, from the side with more of the feature.
func headToHead(decks, allDecks []*storage.Deck, feature deckFeature, z float64) []*GapBucket {
	scale := scaleFor(feature)

	// One empty bucket per label, so every bar shows even with no games.
	buckets := make([]*GapBucket, 0, len(scale.labels))
	for _, label := range scale.labels {
		buckets = append(buckets, &GapBucket{Label: label})
	}

	// Walk each deck's decided games and tally the ones where it had more.
	idx := storage.NewOpponentIndex(allDecks)
	for _, deck := range decks {
		if !hasDecklist(deck) {
			continue
		}
		mine := feature.Value(deck)
		for _, game := range deck.Games {
			if game.Tie || game.Winner == "" {
				continue
			}
			opp, ok := idx.OpponentDeck(deck, game.Opponent)
			if !ok || !hasDecklist(opp) {
				continue
			}
			gap := mine - feature.Value(opp)
			if gap <= 0 {
				continue
			}
			b := buckets[scale.index(gap)]
			if game.Winner == deck.Player {
				b.Wins++
			} else {
				b.Losses++
			}
		}
	}

	// Turn the tallies into win rates and intervals.
	for _, b := range buckets {
		b.Finalize()
		b.SetInterval(z)
	}
	return buckets
}

// CloseMatchRow is one bar of the close-match chart: the share of a macro
// archetype's matches that went to a deciding game.
type CloseMatchRow struct {
	Archetype string `json:"archetype"`

	// Matches counts the archetype's matches with a known score, and Close
	// the ones that went to three games or more.
	Matches int `json:"matches"`
	Close   int `json:"close"`

	// Percent is Close as a share of Matches, with its confidence interval.
	Percent     float64 `json:"percent"`
	PercentLow  float64 `json:"percent_low"`
	PercentHigh float64 `json:"percent_high"`
}

// closeMatches counts, for each macro archetype, how many of its decks'
// matches went to a deciding game. A match two decks of the same archetype
// played counts once for each of them. z is the interval's critical value.
func closeMatches(decks []*storage.Deck, z float64) []*CloseMatchRow {
	// One row per macro archetype, in chart order.
	rows := make([]*CloseMatchRow, 0, len(macroArchetypes))
	byArchetype := make(map[string]*CloseMatchRow, len(macroArchetypes))
	for _, a := range macroArchetypes {
		row := &CloseMatchRow{Archetype: a}
		rows = append(rows, row)
		byArchetype[a] = row
	}

	// Count each deck's matches into its archetype's row.
	for _, d := range decks {
		row, ok := byArchetype[d.Macro()]
		if !ok {
			continue
		}
		for _, m := range d.Matches {
			games := m.Wins + m.Losses + m.Draws
			if games == 0 {
				continue
			}
			row.Matches++
			if games >= 3 {
				row.Close++
			}
		}
	}

	// Close matches are the "wins" here, so draws are zero.
	for _, row := range rows {
		row.Percent = winPctOf(row.Close, row.Matches-row.Close, 0)
		row.PercentLow, row.PercentHigh = wilsonInterval(row.Close, row.Matches-row.Close, 0, z)
	}
	return rows
}
