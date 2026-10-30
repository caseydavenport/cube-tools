package design

// MinPackageCards is the fewest distinct cards a deck needs from a package's
// wire before the package counts as built.
const MinPackageCards = 3

// WireCards is one wire of a package with its groups resolved to card names.
// NeedSources and NeedTargets are how many cards from each side a deck must
// play: 2, or 1 for a side with a single card in the cube, or 0 for a side
// that matches nothing, which makes the wire impossible to build.
type WireCards struct {
	Sources     map[string]bool
	Targets     map[string]bool
	NeedSources int
	NeedTargets int
}

// PackageCards is a package with every wire resolved to card names, ready to
// test against decks without rebuilding the design graph.
type PackageCards struct {
	Name  string
	Wires []WireCards
}

// SideMinimum is how many cards a deck must play from a wire side that has
// cubeCards cards in the cube. A one-card side, such as a single payoff named
// directly, only needs that card.
func SideMinimum(cubeCards int) int {
	return min(cubeCards, 2)
}

// BuiltBy reports whether a deck builds the package. The deck builds it when
// one wire has enough cards on both sides, per NeedSources and NeedTargets,
// and at least MinPackageCards distinct cards across the two. deck holds the
// deck's non-basic mainboard card names.
func (p PackageCards) BuiltBy(deck map[string]bool) bool {
	for _, w := range p.Wires {
		if w.builtBy(deck) {
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
		if len(sources) == 0 || len(targets) == 0 {
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

// builtBy reports whether the deck plays enough of this wire to build it.
func (w WireCards) builtBy(deck map[string]bool) bool {
	if w.NeedSources == 0 || w.NeedTargets == 0 {
		return false
	}
	sources := present(w.Sources, deck)
	targets := present(w.Targets, deck)
	if len(sources) < w.NeedSources || len(targets) < w.NeedTargets {
		return false
	}
	return len(union(sources, targets)) >= MinPackageCards
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
