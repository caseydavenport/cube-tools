package rulebook

import "github.com/caseydavenport/cube-tools/pkg/design"

// InAny keeps packages relevant in any of the drafts, or on today's
// list when there are none, for views over a range of decks.
func InAny(draftIDs []int) func(*design.Relevance) bool {
	return func(r *design.Relevance) bool { return r.InAny(draftIDs) }
}

// InDraft keeps packages relevant in one draft, for a view of one
// deck.
func InDraft(draftID int) func(*design.Relevance) bool {
	return func(r *design.Relevance) bool { return r.InDraft(draftID) }
}

// Today keeps packages relevant on today's list, for views about
// the cube's current list.
func Today(r *design.Relevance) bool {
	return r.InAny(nil)
}
