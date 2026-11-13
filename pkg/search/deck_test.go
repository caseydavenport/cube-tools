package search

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// packageDeck builds a deck from mainboard card names.
func packageDeck(names ...string) fakeDeck {
	cards := make([]types.Card, len(names))
	for i, n := range names {
		cards[i] = types.Card{Name: n}
	}
	return fakeDeck{main: cards}
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

// packageMatches compiles a deck query and runs it with testPackages.
func packageMatches(deck fakeDeck, q string) bool {
	return MustCompile(q, TargetDecks).MatchDeck(deck, DeckOptions{Packages: testPackages()})
}

// TestPackageTerms runs every form of the package term against a deck that
// builds Graveyard and has one Pump card, short of building Pump.
func TestPackageTerms(t *testing.T) {
	deck := packageDeck("gy1", "gy2", "gy3", "gy4", "p1", "c1", "c2", "Forest")
	for q, want := range map[string]bool{
		"package:graveyard":  true,
		"package:GRAVEYARD":  true,
		"package:pump":       false,
		"package:":           true,
		"package:nope":       false,
		"-package:graveyard": false,
		"-package:pump":      true,
		"package!=pump":      true,
		"package!=graveyard": false,
	} {
		assert.Equal(t, want, packageMatches(deck, q), q)
	}
}

func TestPackageBareMissesWithoutAnyPackage(t *testing.T) {
	assert.False(t, packageMatches(packageDeck("gy1", "gy3", "p1", "c1"), "package:"))
}

func TestPackageCombinesWithCardTerm(t *testing.T) {
	deck := packageDeck("gy1", "gy2", "gy3", "gy4")
	deck.main = append(deck.main, types.Card{Name: "Ponder", Types: []string{"Instant"}})

	assert.True(t, packageMatches(deck, "package:graveyard t:instant"))
	assert.False(t, packageMatches(deck, "package:graveyard t:planeswalker"))
}

func TestPackageNoPackagesMeansNoMatch(t *testing.T) {
	deck := packageDeck("gy1", "gy2", "gy3", "gy4")
	assert.False(t, MustCompile("package:graveyard", TargetDecks).MatchDeck(deck, DeckOptions{}))
}

func TestUsesPackages(t *testing.T) {
	for q, want := range map[string]bool{
		"package:graveyard":                   true,
		"package:":                            true,
		"-package:graveyard":                  true,
		"package!=graveyard":                  true,
		"arch:aggro package:graveyard":        true,
		"arch:aggro (package:graveyard or x)": true,
		`"Package Deal"`:                      false,
		"name:package":                        false,
		"":                                    false,
	} {
		assert.Equal(t, want, MustCompile(q, TargetDecks).UsesPackages(), q)
	}
}

func TestPackageHonorsDraftRelevance(t *testing.T) {
	deck := packageDeck("A", "B", "C", "D")
	pkg := design.PackageCards{
		Name: "Lifegain",
		Wires: []design.WireCards{{
			Sources: sideSet("A", "B"), Targets: sideSet("C", "D"),
			NeedSources: 2, NeedTargets: 2,
		}},
		Relevance: &design.Relevance{Drafts: map[int]bool{
			1: true,
			2: false,
		}},
	}
	opts := DeckOptions{Packages: []design.PackageCards{pkg}}
	q := MustCompile("package:lifegain", TargetDecks)

	deck.draftID = 1
	assert.True(t, q.MatchDeck(deck, opts))
	deck.draftID = 2
	assert.False(t, q.MatchDeck(deck, opts), "not in a draft whose list can't support it")
}

func TestHighlightCard(t *testing.T) {
	bolt := cardNamed("Lightning Bolt")
	bears := cardNamed("Grizzly Bears")

	q := MustCompile("arch:aggro t:instant", TargetDecks)
	assert.True(t, q.HighlightCard(bolt))
	assert.False(t, q.HighlightCard(bears))

	// A search of deck terms only marks no card.
	assert.False(t, MustCompile("arch:aggro", TargetDecks).HighlightCard(bolt))
	assert.False(t, MustCompile("", TargetDecks).HighlightCard(bolt))
}

func TestExactCardNames(t *testing.T) {
	both := fakeDeck{main: []types.Card{{Name: "Lightning Bolt"}, {Name: "Bolt Bend"}}}
	boltOnly := fakeDeck{main: []types.Card{{Name: "Lightning Bolt"}}}

	assert.True(t, MustCompile(`card:"bolt bend"`, TargetDecks).MatchDeck(both, DeckOptions{}))
	assert.False(t, MustCompile(`!Bolt`, TargetDecks).MatchDeck(both, DeckOptions{}))
	assert.True(t, MustCompile(`!"Lightning Bolt" !"Bolt Bend"`, TargetDecks).MatchDeck(both, DeckOptions{}))
	assert.False(t, MustCompile(`!"Lightning Bolt" !"Bolt Bend"`, TargetDecks).MatchDeck(boltOnly, DeckOptions{}))
}
