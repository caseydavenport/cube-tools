package design

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// set builds a card name set, the shape BuiltBy and HasCards take for a deck.
func set(names ...string) map[string]bool {
	s := make(map[string]bool, len(names))
	for _, n := range names {
		s[n] = true
	}
	return s
}

// onePackage is a package with a single wire between the given sides, each
// needing the given number of cards.
func onePackage(sources, targets map[string]bool, needSources, needTargets int) PackageCards {
	return PackageCards{
		Name:  "test",
		Wires: []WireCards{{Sources: sources, Targets: targets, NeedSources: needSources, NeedTargets: needTargets}},
	}
}

func TestSideMinimum(t *testing.T) {
	assert.Equal(t, 0, SideMinimum(0))
	assert.Equal(t, 1, SideMinimum(1))
	assert.Equal(t, 1, SideMinimum(3))
	assert.Equal(t, 2, SideMinimum(4))
	assert.Equal(t, 2, SideMinimum(5))
}

func TestPackageCards_BothSidesNeeded(t *testing.T) {
	p := onePackage(set("A", "B"), set("C", "D", "E"), 2, 2)
	assert.True(t, p.BuiltBy(set("A", "B", "C", "D")))

	// Plenty of cards, but only one from the source side.
	assert.False(t, p.BuiltBy(set("A", "C", "D", "E")))
}

func TestPackageCards_SingleCardSide(t *testing.T) {
	p := onePackage(set("P"), set("C", "D", "E"), 1, 2)
	assert.True(t, p.BuiltBy(set("P", "C", "D")))
	assert.False(t, p.BuiltBy(set("P", "C")))
}

func TestPackageCards_NeedsThreeCards(t *testing.T) {
	p := onePackage(set("P"), set("Q"), 1, 1)
	assert.False(t, p.BuiltBy(set("P", "Q")))
}

func TestPackageCards_EmptySideNeverBuilt(t *testing.T) {
	p := onePackage(set(), set("C", "D", "E"), 0, 2)
	assert.False(t, p.BuiltBy(set("C", "D", "E")))
}

func TestPackageCards_OverlapCountsOnce(t *testing.T) {
	p := onePackage(set("A", "B"), set("B", "C"), 2, 2)
	assert.True(t, p.BuiltBy(set("A", "B", "C")))

	// Both sides are met by the same two cards, which is short of three.
	same := onePackage(set("A", "B"), set("A", "B"), 2, 2)
	assert.False(t, same.BuiltBy(set("A", "B")))
}

func TestPackageCards_AnyWire(t *testing.T) {
	p := PackageCards{
		Name: "test",
		Wires: []WireCards{
			{Sources: set("X", "Y"), Targets: set("Z", "W"), NeedSources: 2, NeedTargets: 2},
			{Sources: set("A", "B"), Targets: set("C", "D"), NeedSources: 2, NeedTargets: 2},
		},
	}
	assert.True(t, p.BuiltBy(set("A", "B", "C", "D")))
	assert.False(t, p.BuiltBy(set("A", "B", "Z", "W")))
}

func TestPackageCards_HasCards(t *testing.T) {
	p := onePackage(set("A", "B"), set("C", "D", "E"), 2, 2)
	assert.True(t, p.HasCards(set("A", "C", "D")))
	assert.False(t, p.HasCards(set("C", "D", "E")))
	assert.False(t, p.HasCards(set("A", "C")))
}

// basicsWire is a package whose one wire needs two of A, B and C on one side,
// and is met on the other side by any basic Forest.
func basicsWire() PackageCards {
	return PackageCards{
		Name: "Fixing",
		Wires: []WireCards{{
			Sources:      set("A", "B", "C"),
			Targets:      set(),
			NeedSources:  2,
			NeedTargets:  0,
			TargetBasics: set("Forest"),
		}},
	}
}

func TestPackageCards_BasicsMeetASide(t *testing.T) {
	p := basicsWire()
	assert.False(t, p.BuiltBy(set("A", "B", "Forest")), "basics don't count toward the three cards")
	assert.True(t, p.BuiltBy(set("A", "B", "C", "Forest")))
	assert.False(t, p.BuiltBy(set("A", "B", "C")), "without a basic the other side is unmet")
}

func TestPackageCards_HasCardsWithBasics(t *testing.T) {
	assert.True(t, basicsWire().HasCards(set("A", "B", "C", "Forest")))
}
