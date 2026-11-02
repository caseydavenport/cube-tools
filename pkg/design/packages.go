package design

import "math"

// MinPackageCards is the fewest distinct cards a deck needs from a package's
// wire before the package counts as built.
const MinPackageCards = 3

// WireCards is one wire of a package with its groups resolved to card names.
// NeedSources and NeedTargets are how many cards from each side a deck must
// play, from SideMinimum, or 0 for a side that matches nothing. Buildarounds
// are the wire's build-around cards, which can carry their side alone. SourceBasics and TargetBasics are the basic lands a
// side's groups match; playing any of them meets that side, since every deck
// gets basics free.
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

// BuildaroundLinks is how many links a build-around needs to carry its side
// alone: build-arounds played on the side times cards played on the other.
const BuildaroundLinks = 8

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

// BuiltBy reports whether a deck builds the package. The deck builds it when
// one wire has enough cards on both sides, per NeedSources and NeedTargets,
// and at least MinPackageCards distinct non-basic cards across the two. deck
// holds the deck's mainboard card names, basic lands included.
func (p PackageCards) BuiltBy(deck map[string]bool) bool {
	for _, w := range p.Wires {
		if w.BuiltBy(deck) {
			return true
		}
	}
	return false
}

// HasCards reports whether the deck plays at least MinPackageCards of the
// package's cards on wires where both sides are present, whether or not it
// plays enough of each side to build the package.
func (p PackageCards) HasCards(deck map[string]bool) bool {
	cards := make(map[string]bool)
	for _, w := range p.Wires {
		sources := present(w.Sources, deck)
		targets := present(w.Targets, deck)
		if !sidePresent(sources, w.SourceBasics, deck) || !sidePresent(targets, w.TargetBasics, deck) {
			continue
		}
		both := union(sources, targets)
		if len(both) < 2 {
			continue
		}
		for name := range both {
			cards[name] = true
		}
	}
	return len(cards) >= MinPackageCards
}

// BuiltBy reports whether the deck plays enough of this wire to build the
// package through it.
func (w WireCards) BuiltBy(deck map[string]bool) bool {
	sources := present(w.Sources, deck)
	targets := present(w.Targets, deck)
	if !w.sideMet(sources, w.NeedSources, w.SourceBasics, len(targets), deck) ||
		!w.sideMet(targets, w.NeedTargets, w.TargetBasics, len(sources), deck) {
		return false
	}
	return len(union(sources, targets)) >= MinPackageCards
}

// sideMet reports whether a deck plays enough of one wire side: need of its
// non-basic cards, any of its basics, or a build-around with BuildaroundLinks
// links to the other side's other played cards. A side needing 0 with no
// basics matches nothing and is never met.
func (w WireCards) sideMet(played map[string]bool, need int, basics map[string]bool, other int, deck map[string]bool) bool {
	if need > 0 && len(played) >= need {
		return true
	}
	if playsAny(basics, deck) {
		return true
	}
	return playsAny(w.Buildarounds, played) && len(played)*other >= BuildaroundLinks
}

// sidePresent reports whether a deck plays anything from one wire side,
// counting its basics.
func sidePresent(played, basics, deck map[string]bool) bool {
	return len(played) > 0 || playsAny(basics, deck)
}

// playsAny reports whether the deck plays any of names.
func playsAny(names, deck map[string]bool) bool {
	for name := range names {
		if deck[name] {
			return true
		}
	}
	return false
}

// present returns the cards in side that the deck plays.
func present(side, deck map[string]bool) map[string]bool {
	out := make(map[string]bool)
	for name := range side {
		if deck[name] {
			out[name] = true
		}
	}
	return out
}

// union returns every card in either set, each once.
func union(a, b map[string]bool) map[string]bool {
	out := make(map[string]bool, len(a)+len(b))
	for name := range a {
		out[name] = true
	}
	for name := range b {
		out[name] = true
	}
	return out
}
