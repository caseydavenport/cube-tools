package design

import "math"

// minPackageCards is the fewest distinct cards a deck needs from a package's
// wire before the package counts as built.
const minPackageCards = 3

// WireCards is one wire of a package with its groups resolved to card names.
// NeedSources and NeedTargets are how many cards from each side a deck must
// play, from SideMinimum, or 0 for a side that matches nothing. Buildarounds
// are the wire's build-around cards, which can carry their side alone.
// SourceBasics and TargetBasics are the basic lands a side's groups match;
// playing any of them meets that side, since every deck gets basics free.
type WireCards struct {
	Sources      map[string]bool
	Targets      map[string]bool
	NeedSources  int
	NeedTargets  int
	SourceBasics map[string]bool
	TargetBasics map[string]bool
	Buildarounds map[string]bool
}

// PackageCards is a package with every wire resolved to card names, ready to
// test against decks without rebuilding the design graph. Relevance says
// where the cube's lists support it; nil means everywhere.
type PackageCards struct {
	Name      string
	Wires     []WireCards
	Relevance *Relevance
}

// buildaroundLinks is how many links a build-around needs to carry its side
// alone: build-arounds played on the side times cards played on the other.
const buildaroundLinks = 8

// SideMinimum is how many cards a deck must play from a wire side with
// cubeCards cards in the cube, when the other side has otherCards. The
// scarcer side defines the package and needs 2, even if the cube has only
// one; the other needs half the square root of its size, between 1 and 3.
func SideMinimum(cubeCards, otherCards int) int {
	if cubeCards == 0 {
		return 0
	}
	if cubeCards <= otherCards {
		return 2
	}
	return min(3, max(1, int(math.Round(math.Sqrt(float64(cubeCards))/2))))
}

// CardCounts maps card names to how many copies a deck or cube list holds, so
// a second copy of a card counts toward a package like any other card.
type CardCounts map[string]int

// copies is how many cards the counts hold in all.
func copies(counts CardCounts) int {
	n := 0
	for _, c := range counts {
		n += c
	}
	return n
}

// BuiltBy reports whether a deck builds the package. The deck builds it when
// one wire has enough cards on both sides, per NeedSources and NeedTargets,
// and at least minPackageCards non-basic cards across the two, counting
// copies. deck holds the deck's mainboard, basic lands included.
func (p PackageCards) BuiltBy(deck CardCounts) bool {
	for _, w := range p.Wires {
		if w.BuiltBy(deck) {
			return true
		}
	}
	return false
}

// HasCards reports whether the deck plays at least minPackageCards of the
// package's cards, counting copies, on wires where both sides are present,
// whether or not it plays enough of each side to build the package.
func (p PackageCards) HasCards(deck CardCounts) bool {
	cards := CardCounts{}
	for _, w := range p.Wires {
		sources := present(w.Sources, deck)
		targets := present(w.Targets, deck)
		if !sidePresent(sources, w.SourceBasics, deck) || !sidePresent(targets, w.TargetBasics, deck) {
			continue
		}
		both := union(sources, targets)

		// One card alone links nothing, so it doesn't count toward the package.
		if copies(both) < 2 {
			continue
		}
		for name, n := range both {
			cards[name] = n
		}
	}
	return copies(cards) >= minPackageCards
}

// BuiltBy reports whether the deck plays enough of this wire to build the
// package through it.
func (w WireCards) BuiltBy(deck CardCounts) bool {
	sources := present(w.Sources, deck)
	targets := present(w.Targets, deck)
	if !w.sideMet(sources, w.NeedSources, w.SourceBasics, copies(targets), deck) ||
		!w.sideMet(targets, w.NeedTargets, w.TargetBasics, copies(sources), deck) {
		return false
	}
	return copies(union(sources, targets)) >= minPackageCards
}

// sideMet reports whether a deck plays enough of one wire side: need of its
// non-basic cards, counting copies, any of its basics, or a build-around with
// buildaroundLinks links to the other side's other played cards. A side
// needing 0 with no basics matches nothing and is never met.
func (w WireCards) sideMet(played CardCounts, need int, basics map[string]bool, other int, deck CardCounts) bool {
	if need > 0 && copies(played) >= need {
		return true
	}
	if playsAny(basics, deck) {
		return true
	}
	return playsAny(w.Buildarounds, played) && copies(played)*other >= buildaroundLinks
}

// sidePresent reports whether a deck plays anything from one wire side,
// counting its basics.
func sidePresent(played CardCounts, basics map[string]bool, deck CardCounts) bool {
	return len(played) > 0 || playsAny(basics, deck)
}

// playsAny reports whether the deck plays any of names.
func playsAny(names map[string]bool, deck CardCounts) bool {
	for name := range names {
		if deck[name] > 0 {
			return true
		}
	}
	return false
}

// present returns the cards in side that the deck plays, with their copies.
func present(side map[string]bool, deck CardCounts) CardCounts {
	out := CardCounts{}
	for name := range side {
		if n := deck[name]; n > 0 {
			out[name] = n
		}
	}
	return out
}

// union returns every card in either count, each once with its copies, so a
// card on both sides of a wire isn't counted twice.
func union(a, b CardCounts) CardCounts {
	out := make(CardCounts, len(a)+len(b))
	for name, n := range a {
		out[name] = n
	}
	for name, n := range b {
		out[name] = max(out[name], n)
	}
	return out
}
