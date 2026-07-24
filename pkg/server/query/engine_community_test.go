package query

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

// communityDeck builds a mock deck from mainboard card names.
func communityDeck(names ...string) *mockDeck {
	cards := make([]types.Card, len(names))
	for i, n := range names {
		cards[i] = types.Card{Name: n}
	}
	return &mockDeck{mainboard: cards}
}

// communityEdges is a graveyard triangle plus fetch cards that only attach to
// graveyard cards, so fetches never cohere into a package of their own.
func communityEdges() []graph.Edge {
	return []graph.Edge{
		{A: "gy1", B: "gy2", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "gy2", B: "gy3", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "gy1", B: "gy3", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "f1", B: "gy1", Weight: 1, Labels: []string{"Fetches"}},
		{A: "f2", B: "gy2", Weight: 1, Labels: []string{"Fetches"}},
		{A: "f3", B: "gy3", Weight: 1, Labels: []string{"Fetches"}},
	}
}

func TestCommunity_LabelMatchesWhenPackageForms(t *testing.T) {
	deck := communityDeck("gy1", "gy2", "gy3", "Forest")
	assert.True(t, DeckMatchesBoardGraph(deck, "community:graveyard", "", communityEdges()))
}

func TestCommunity_LabelIsCaseInsensitive(t *testing.T) {
	deck := communityDeck("gy1", "gy2", "gy3")
	assert.True(t, DeckMatchesBoardGraph(deck, "community:GRAVEYARD", "", communityEdges()))
}

func TestCommunity_LabelMissesWhenPackageAbsent(t *testing.T) {
	// Only two graveyard cards: a pairing, not a package.
	deck := communityDeck("gy1", "gy2", "Forest")
	assert.False(t, DeckMatchesBoardGraph(deck, "community:graveyard", "", communityEdges()))
}

func TestCommunity_WrongLabelMisses(t *testing.T) {
	// The fetch cards touch three graveyard cards but never form their own
	// community, so a graveyard package doesn't count as a fetches package.
	deck := communityDeck("gy1", "gy2", "gy3", "f1", "f2", "f3")
	assert.False(t, DeckMatchesBoardGraph(deck, "community:fetches", "", communityEdges()))
}

func TestCommunity_BareMatchesAnyPackage(t *testing.T) {
	withPkg := communityDeck("gy1", "gy2", "gy3")
	withoutPkg := communityDeck("gy1", "gy2")

	assert.True(t, DeckMatchesBoardGraph(withPkg, "community:", "", communityEdges()))
	assert.False(t, DeckMatchesBoardGraph(withoutPkg, "community:", "", communityEdges()))
}

func TestCommunity_NegationWithLeadingDash(t *testing.T) {
	hasPkg := communityDeck("gy1", "gy2", "gy3")
	noPkg := communityDeck("gy1", "gy2")

	assert.False(t, DeckMatchesBoardGraph(hasPkg, "-community:graveyard", "", communityEdges()))
	assert.True(t, DeckMatchesBoardGraph(noPkg, "-community:graveyard", "", communityEdges()))
}

func TestCommunity_NegationWithNotEquals(t *testing.T) {
	hasPkg := communityDeck("gy1", "gy2", "gy3")
	assert.False(t, DeckMatchesBoardGraph(hasPkg, "community!=graveyard", "", communityEdges()))
}

func TestCommunity_CombinesWithCardTerm(t *testing.T) {
	deck := communityDeck("gy1", "gy2", "gy3")
	deck.mainboard = append(deck.mainboard, types.Card{Name: "Ponder", Types: []string{"Instant"}})

	// Both the community and the card term hold.
	assert.True(t, DeckMatchesBoardGraph(deck, "community:graveyard t:instant", "", communityEdges()))
	// The card term fails, so the whole query fails despite the package forming.
	assert.False(t, DeckMatchesBoardGraph(deck, "community:graveyard t:planeswalker", "", communityEdges()))
}

func TestCommunity_NoEdgesMeansNoMatch(t *testing.T) {
	deck := communityDeck("gy1", "gy2", "gy3")
	// DeckMatchesBoard passes no graph, so a community term can't be evaluated.
	assert.False(t, DeckMatchesBoard(deck, "community:graveyard", ""))
}
