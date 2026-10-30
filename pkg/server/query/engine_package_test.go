package query

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// packageDeck builds a mock deck from mainboard card names.
func packageDeck(names ...string) *mockDeck {
	cards := make([]types.Card, len(names))
	for i, n := range names {
		cards[i] = types.Card{Name: n}
	}
	return &mockDeck{mainboard: cards}
}

// sideSet builds a set of card names for one side of a wire.
func sideSet(names ...string) map[string]bool {
	out := make(map[string]bool, len(names))
	for _, n := range names {
		out[n] = true
	}
	return out
}

// testPackages are Graveyard (two payoffs wired to two enablers) and Pump
// (two pump spells wired to two creatures).
func testPackages() []design.PackageCards {
	return []design.PackageCards{
		{Name: "Graveyard", Wires: []design.WireCards{{Sources: sideSet("gy1", "gy2"), Targets: sideSet("gy3", "gy4"), NeedSources: 2, NeedTargets: 2}}},
		{Name: "Pump", Wires: []design.WireCards{{Sources: sideSet("p1", "p2"), Targets: sideSet("c1", "c2"), NeedSources: 2, NeedTargets: 2}}},
	}
}

// TestDeckBuildsPackage_Terms runs every form of the package term against a
// deck that builds Graveyard and has one Pump card, short of building Pump.
func TestDeckBuildsPackage_Terms(t *testing.T) {
	deck := packageDeck("gy1", "gy2", "gy3", "gy4", "p1", "c1", "c2", "Forest")
	for match, want := range map[string]bool{
		"package:graveyard":    true,
		"package:GRAVEYARD":    true,
		"package:pump":         false,
		"package:":             true,
		"package:nope":         false,
		"-package:graveyard":   false,
		"-package:pump":        true,
		"package!=pump":        true,
		"package!=graveyard":   false,
		"community:graveyard":  true,
		"community!=graveyard": false,
	} {
		assert.Equal(t, want, DeckMatchesBoardPackages(deck, match, "", testPackages()), match)
	}
}

func TestDeckBuildsPackage_BareMissesWithoutAnyPackage(t *testing.T) {
	deck := packageDeck("gy1", "gy3", "p1", "c1")
	assert.False(t, DeckMatchesBoardPackages(deck, "package:", "", testPackages()))
}

func TestDeckBuildsPackage_CombinesWithCardTerm(t *testing.T) {
	deck := packageDeck("gy1", "gy2", "gy3", "gy4")
	deck.mainboard = append(deck.mainboard, types.Card{Name: "Ponder", Types: []string{"Instant"}})

	assert.True(t, DeckMatchesBoardPackages(deck, "package:graveyard t:instant", "", testPackages()))
	assert.False(t, DeckMatchesBoardPackages(deck, "package:graveyard t:planeswalker", "", testPackages()))
}

func TestDeckBuildsPackage_NoPackagesMeansNoMatch(t *testing.T) {
	deck := packageDeck("gy1", "gy2", "gy3", "gy4")

	// DeckMatchesBoard passes no packages, so a package term can't be evaluated.
	assert.False(t, DeckMatchesBoard(deck, "package:graveyard", ""))
}

func TestHasPackageTerm(t *testing.T) {
	for match, want := range map[string]bool{
		"package:graveyard":            true,
		"package:":                     true,
		"-package:graveyard":           true,
		"package!=graveyard":           true,
		"community:graveyard":          true,
		"arch:aggro package:graveyard": true,
		"Package Deal":                 false,
		"name:package":                 false,
		"":                             false,
	} {
		assert.Equal(t, want, HasPackageTerm(match), match)
	}
}
