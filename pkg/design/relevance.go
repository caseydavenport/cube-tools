package design

const (
	// RelevantScarceCards is how many cards a wire's scarcer side needs in a
	// card list before the wire counts as present there.
	RelevantScarceCards = 2

	// RelevantOtherCards is how many cards the other side needs.
	RelevantOtherCards = 3
)

// PresentIn reports whether the wire is present in a cube list: its scarcer
// side has RelevantScarceCards of the list's cards, counting copies, and the
// other side RelevantOtherCards. A side whose groups match a basic land always
// counts as met, since every deck gets basics free, so the other side then
// needs only RelevantScarceCards.
func (w WireCards) PresentIn(list CardCounts) bool {
	sources := copies(present(w.Sources, list))
	targets := copies(present(w.Targets, list))
	sourceBasics := len(w.SourceBasics) > 0
	targetBasics := len(w.TargetBasics) > 0
	if sourceBasics && targetBasics {
		return true
	}
	if sourceBasics {
		return targets >= RelevantScarceCards
	}
	if targetBasics {
		return sources >= RelevantScarceCards
	}
	return min(sources, targets) >= RelevantScarceCards && max(sources, targets) >= RelevantOtherCards
}

// PresentIn reports whether any of the package's wires is present in a cube
// list, which makes the package relevant to a cube with that list.
func (p PackageCards) PresentIn(list CardCounts) bool {
	for _, w := range p.Wires {
		if w.PresentIn(list) {
			return true
		}
	}
	return false
}

// Relevance records where a package is relevant: on today's cube list, and
// on each draft's own list. Drafts holds a verdict for every draft with a
// snapshot; a draft with an empty snapshot is recorded as relevant, since an
// empty list says nothing about the cube.
type Relevance struct {
	Today  bool
	Drafts map[int]bool
}

// InDraft reports whether the package is relevant to decks from a draft. A
// nil Relevance is relevant everywhere, and a draft without a verdict falls
// back to today's list.
func (r *Relevance) InDraft(draftID int) bool {
	if r == nil {
		return true
	}
	if v, ok := r.Drafts[draftID]; ok {
		return v
	}
	return r.Today
}

// InAny reports whether the package is relevant in any of the drafts, for
// views that span a range of decks. With no drafts it falls back to today's
// list, so a range without decks still shows the cube's packages.
func (r *Relevance) InAny(draftIDs []int) bool {
	if r == nil {
		return true
	}
	if len(draftIDs) == 0 {
		return r.Today
	}
	for _, id := range draftIDs {
		if r.InDraft(id) {
			return true
		}
	}
	return false
}

// BuiltIn reports whether a deck from a draft builds the package: the package
// must be relevant in that draft, and the deck must build it per BuiltBy.
func (p PackageCards) BuiltIn(draftID int, deck CardCounts) bool {
	return p.Relevance.InDraft(draftID) && p.BuiltBy(deck)
}
