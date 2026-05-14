package stats

import (
	"math"
	"os"
	"slices"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func loadAllDecks(b *testing.B) []*storage.Deck {
	b.Helper()
	// Tests run with CWD=pkg/server/stats; the data dir lives at the repo root.
	if _, err := os.Stat("data/polyverse/index.json"); err != nil {
		if err := os.Chdir("../../.."); err != nil {
			b.Fatal(err)
		}
	}
	store := storage.NewFileDeckStoreWithCache()
	decks, err := store.List(&storage.DecksRequest{})
	if err != nil {
		b.Fatal(err)
	}
	if len(decks) == 0 {
		b.Skip("no decks on disk")
	}
	return decks
}

// The pre-refactor ELO algorithm, kept here so we can benchmark it against
// the current implementation on the same input.
func originalELOData(decks []*storage.Deck) map[string]int {
	type elo struct {
		elo  float64
		diff float64
	}
	cards := make(map[string]*elo)
	for _, d := range decks {
		for _, card := range d.Mainboard {
			if _, ok := cards[card.Name]; !ok {
				cards[card.Name] = &elo{elo: 1200}
			}
		}
		for _, card := range d.Sideboard {
			if _, ok := cards[card.Name]; !ok {
				cards[card.Name] = &elo{elo: 1200}
			}
		}
	}
	for _, deck := range decks {
		for _, c1 := range deck.Mainboard {
			if c1.IsBasicLand() {
				continue
			}
			for _, c2 := range deck.Sideboard {
				if c2.IsBasicLand() {
					continue
				}
				if !deck.CanCast(c2) {
					continue
				}
				winValue := 1.0
				if c1.CMC != c2.CMC {
					winValue -= 0.025 * math.Abs(float64(c1.CMC-c2.CMC))
				}
				colorMatch := true
				if c1.Colors != nil && c2.Colors != nil {
					for _, color := range c1.Colors {
						for _, color2 := range c2.Colors {
							if !slices.Contains(c1.Colors, color2) || !slices.Contains(c2.Colors, color) {
								colorMatch = false
							}
						}
					}
				}
				if !colorMatch {
					winValue -= 0.05
				}
				if c1.IsCreature() != c2.IsCreature() {
					winValue -= 0.1
				}
				if winValue < 0.55 {
					winValue = 0.55
				}
				cc1, cc2 := cards[c1.Name], cards[c2.Name]
				r1 := math.Pow(10, cc1.elo/400)
				r2 := math.Pow(10, cc2.elo/400)
				e1 := r1 / (r1 + r2)
				e2 := r2 / (r1 + r2)
				s1 := winValue
				s2 := 1 - winValue
				k := 16.0
				cc1.diff += k * (s1 - e1)
				cc2.diff += k * (s2 - e2)
			}
		}
		for _, c1 := range deck.Mainboard {
			c := cards[c1.Name]
			c.elo += math.Round(c.diff)
			c.diff = 0
		}
		for _, c2 := range deck.Sideboard {
			c := cards[c2.Name]
			c.elo += math.Round(c.diff)
			c.diff = 0
		}
	}
	result := make(map[string]int)
	for name, c := range cards {
		result[name] = int(c.elo)
	}
	return result
}

// Keep types referenced so the import doesn't disappear if the original
// algorithm is removed in the future.
var _ types.Card

func BenchmarkELO_Original(b *testing.B) {
	decks := loadAllDecks(b)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		originalELOData(decks)
	}
}

func BenchmarkELO_Current(b *testing.B) {
	decks := loadAllDecks(b)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ELOData(decks)
	}
}
