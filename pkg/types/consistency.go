package types

import (
	"sort"
	"strings"
)

// DiscrepancyKind is how a draft's count of a card differs from the cube's.
type DiscrepancyKind string

const (
	// DiscrepancyUnknown is a card the cube doesn't have at all.
	DiscrepancyUnknown DiscrepancyKind = "unknown"

	// DiscrepancyOver is more copies than the cube has.
	DiscrepancyOver DiscrepancyKind = "over"

	// DiscrepancyMissing is fewer copies than the cube has, including none. A
	// draft with empty seats always has these, so they never block.
	DiscrepancyMissing DiscrepancyKind = "missing"
)

// discrepancyOrder sorts the kinds that block an import ahead of missing.
var discrepancyOrder = map[DiscrepancyKind]int{
	DiscrepancyUnknown: 0,
	DiscrepancyOver:    1,
	DiscrepancyMissing: 2,
}

// Discrepancy is one card whose count across a draft differs from the cube.
type Discrepancy struct {
	CardName string
	Seen     int
	Cube     int
	Kind     DiscrepancyKind
}

// DraftCheck compares a draft's cards with the cube they came from.
type DraftCheck struct {
	// Discrepancies is nil when every card matches.
	Discrepancies []Discrepancy

	// CubeTotal counts every card in the cube, and SeenInCube counts the
	// draft's copies of those cards.
	CubeTotal  int
	SeenInCube int
}

// Conflicts counts the discrepancies that mean a draft was entered wrongly:
// over-counts and cards not in the cube.
func (dc DraftCheck) Conflicts() int {
	n := 0
	for _, d := range dc.Discrepancies {
		if d.Kind != DiscrepancyMissing {
			n++
		}
	}
	return n
}

// SeenTotal counts every copy in the draft, including cards the cube doesn't
// have.
func (dc DraftCheck) SeenTotal() int {
	total := dc.SeenInCube
	for _, d := range dc.Discrepancies {
		if d.Kind == DiscrepancyUnknown {
			total += d.Seen
		}
	}
	return total
}

// CheckDraft compares the draft's cards with the cube. Names match without
// regard to case, and basic lands are skipped since every deck brings its own.
// A cube card is reported under the cube's spelling, and an unknown card under
// the last spelling in cards.
func (c *Cube) CheckDraft(cards []CountedCard) DraftCheck {
	numSeen := map[string]int{}
	spelling := map[string]string{}
	for _, card := range cards {
		if card.Count <= 0 || IsBasic(card.Name) {
			continue
		}
		key := strings.ToLower(card.Name)
		numSeen[key] += card.Count
		spelling[key] = card.Name
	}

	var out DraftCheck
	inCube := map[string]bool{}
	for _, name := range c.Names() {
		key := strings.ToLower(name)
		if inCube[key] {
			continue
		}
		inCube[key] = true
		want := c.MaxCopies(name)
		got := numSeen[key]
		out.CubeTotal += want
		out.SeenInCube += got
		switch {
		case got > want:
			out.Discrepancies = append(out.Discrepancies, Discrepancy{CardName: name, Seen: got, Cube: want, Kind: DiscrepancyOver})
		case got < want:
			out.Discrepancies = append(out.Discrepancies, Discrepancy{CardName: name, Seen: got, Cube: want, Kind: DiscrepancyMissing})
		}
	}
	for key, got := range numSeen {
		if !inCube[key] {
			out.Discrepancies = append(out.Discrepancies, Discrepancy{CardName: spelling[key], Seen: got, Kind: DiscrepancyUnknown})
		}
	}

	sort.Slice(out.Discrepancies, func(i, j int) bool {
		a, b := out.Discrepancies[i], out.Discrepancies[j]
		if a.Kind != b.Kind {
			return discrepancyOrder[a.Kind] < discrepancyOrder[b.Kind]
		}
		return a.CardName < b.CardName
	})
	return out
}
