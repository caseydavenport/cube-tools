package types

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

// checkCube holds Monastery Mentor once, Snapcaster Mage twice, and ten
// singletons, so a short draft leaves cards missing.
func checkCube() *Cube {
	c := &Cube{Cards: []Card{{Name: "Monastery Mentor"}, {Name: "Snapcaster Mage"}, {Name: "Snapcaster Mage"}}}
	for i := 1; i <= 10; i++ {
		c.Cards = append(c.Cards, Card{Name: fmt.Sprintf("Filler %d", i)})
	}
	return c
}

// fullDraft is every card in checkCube, at its cube count.
func fullDraft() []CountedCard {
	out := []CountedCard{{Name: "Monastery Mentor", Count: 1}, {Name: "Snapcaster Mage", Count: 2}}
	for i := 1; i <= 10; i++ {
		out = append(out, CountedCard{Name: fmt.Sprintf("Filler %d", i), Count: 1})
	}
	return out
}

type checkDraftCase struct {
	name       string
	cards      []CountedCard
	want       []Discrepancy
	seenInCube int
	seenTotal  int
	conflicts  int
}

func TestCheckDraft(t *testing.T) {
	for _, tc := range []checkDraftCase{
		{name: "full draft is clean", cards: fullDraft(), seenInCube: 13, seenTotal: 13},
		{
			name:       "names match case-insensitively",
			cards:      append(fullDraft()[2:], CountedCard{Name: "monastery mentor", Count: 1}, CountedCard{Name: "SNAPCASTER MAGE", Count: 2}),
			seenInCube: 13,
			seenTotal:  13,
		},
		{
			name:       "basics and zero counts are skipped",
			cards:      append(fullDraft(), CountedCard{Name: "Plains", Count: 7}, CountedCard{Name: "Black Lotus", Count: 0}),
			seenInCube: 13,
			seenTotal:  13,
		},
		{
			name: "each kind, sorted unknown then over then missing",
			cards: append(fullDraft()[2:],
				CountedCard{Name: "Monastery Mentor", Count: 2},
				CountedCard{Name: "Black Lotus", Count: 1},
				CountedCard{Name: "Ancestral Recall", Count: 1},
			),
			want: []Discrepancy{
				{CardName: "Ancestral Recall", Seen: 1, Kind: DiscrepancyUnknown},
				{CardName: "Black Lotus", Seen: 1, Kind: DiscrepancyUnknown},
				{CardName: "Monastery Mentor", Seen: 2, Cube: 1, Kind: DiscrepancyOver},
				{CardName: "Snapcaster Mage", Seen: 0, Cube: 2, Kind: DiscrepancyMissing},
			},
			seenInCube: 12,
			seenTotal:  14,
			conflicts:  3,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := checkCube().CheckDraft(tc.cards)
			assert.Equal(t, tc.want, got.Discrepancies)
			assert.Equal(t, 13, got.CubeTotal)
			assert.Equal(t, tc.seenInCube, got.SeenInCube)
			assert.Equal(t, tc.seenTotal, got.SeenTotal())
			assert.Equal(t, tc.conflicts, got.Conflicts())
		})
	}
}

func TestCheckDraftUnknownKeepsLastSpelling(t *testing.T) {
	got := checkCube().CheckDraft(append(fullDraft(), CountedCard{Name: "black lotus", Count: 1}, CountedCard{Name: "Black Lotus", Count: 1}))
	assert.Equal(t, []Discrepancy{{CardName: "Black Lotus", Seen: 2, Kind: DiscrepancyUnknown}}, got.Discrepancies)
}

func TestCheckDraftCleanHasNilDiscrepancies(t *testing.T) {
	assert.Nil(t, checkCube().CheckDraft(fullDraft()).Discrepancies)
}
