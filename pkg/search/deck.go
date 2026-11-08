package search

import (
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Deck is what a deck query reads. It is an interface so the storage
// package's deck can satisfy it without an import cycle.
type Deck interface {
	GetPlayer() string
	GetLabels() []string
	GetDraftSize() int
	GetMainboard() []types.Card
	GetSideboard() []types.Card
	GetPool() []types.Card
	GetColors() types.ColorIdentity

	// GetEventTerms returns the words an event: term or a bare word can match
	// the deck's draft by: its event code, name and flight.
	GetEventTerms() []string

	// GetDraftID returns the draft the deck was played in, which decides
	// which packages its draft's cube list supported.
	GetDraftID() int
}

// DeckOptions are what a deck query needs beyond the deck.
type DeckOptions struct {
	// Board is the board card terms search: "Sideboard", "Pool", or the
	// mainboard for anything else.
	Board string

	// Packages are the cube's resolved packages, needed when UsesPackages
	// reports a package: term.
	Packages []design.PackageCards
}

// MatchDeck reports whether a deck matches. Each top-level clause must hold:
// a deck keyword reads the deck, a card term needs some card on the board to
// match, and a parenthesized group of card terms needs one card to match the
// whole group.
func (q *Query) MatchDeck(d Deck, opts DeckOptions) bool {
	if q.Empty() {
		return true
	}
	return q.root.matchDeck(deckSubject{deck: d, opts: opts, cards: boardCards(d, opts.Board)})
}

// UsesPackages reports whether the query has a package: term, so a caller
// knows to load the cube's packages before matching.
func (q *Query) UsesPackages() bool {
	return !q.Empty() && usesPackages(q.root)
}

// usesPackages walks the tree for a package: term.
func usesPackages(n node) bool {
	switch n := n.(type) {
	case *termNode:
		return n.term.kw != nil && n.term.kw.Name == "package"
	case *andNode:
		return anyUsesPackages(n.children)
	case *orNode:
		return anyUsesPackages(n.children)
	case *notNode:
		return usesPackages(n.child)
	case *groupNode:
		return usesPackages(n.child)
	}
	return false
}

func anyUsesPackages(nodes []node) bool {
	for _, n := range nodes {
		if usesPackages(n) {
			return true
		}
	}
	return false
}

// deckSubject is a deck being judged, with the board its card terms search.
type deckSubject struct {
	deck  Deck
	opts  DeckOptions
	cards []types.Card
}

// anyCard reports whether some card on the board matches.
func (d deckSubject) anyCard(match func(Card) bool) bool {
	for _, c := range d.cards {
		if match(Card{Card: c}) {
			return true
		}
	}
	return false
}

// bareWordMatches reports whether a bare word names the deck's player, one
// of its archetype labels or its event.
func (d deckSubject) bareWordMatches(t *term) bool {
	if t.text(strings.ToLower(d.deck.GetPlayer())) {
		return true
	}
	return t.anyText(d.deck.GetLabels()) || t.anyText(d.deck.GetEventTerms())
}

// buildsPackage reports whether the deck's mainboard builds the named
// package, or any package for an empty name. Basic lands count, since they
// meet wire sides whose groups match them.
func (d deckSubject) buildsPackage(name string) bool {
	deck := design.CardCounts{}
	for _, c := range d.deck.GetMainboard() {
		deck[c.Name]++
	}
	for _, p := range d.opts.Packages {
		if name != "" && !strings.EqualFold(p.Name, name) {
			continue
		}
		if p.BuiltIn(d.deck.GetDraftID(), deck) {
			return true
		}
	}
	return false
}

// boardCards returns the cards on the named board. Card terms search the
// mainboard unless the decklist view's board toggle asks for another.
func boardCards(d Deck, board string) []types.Card {
	switch board {
	case "Sideboard":
		return d.GetSideboard()
	case "Pool":
		return d.GetPool()
	}
	return d.GetMainboard()
}
