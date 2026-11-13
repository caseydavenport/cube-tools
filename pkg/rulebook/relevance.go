package rulebook

import (
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
)

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

// attachRelevance records on each package where the cube's lists support it,
// then applies the cube's overrides: a package forced on is relevant
// everywhere and one forced off nowhere. Override names match ignoring case,
// and names that match no package are ignored.
func attachRelevance(pkgs []design.PackageCards, lists cardLists, ov design.PackageOverrides) {
	on := lowerSet(ov.On)
	off := lowerSet(ov.Off)
	for i := range pkgs {
		p := &pkgs[i]
		rel := &design.Relevance{Today: p.PresentIn(lists.today), Drafts: map[int]bool{}}
		for draftID, names := range lists.drafts {
			rel.Drafts[draftID] = names == nil || p.PresentIn(names)
		}
		name := strings.ToLower(p.Name)
		if on[name] {
			forceRelevance(rel, true)
		} else if off[name] {
			forceRelevance(rel, false)
		}
		p.Relevance = rel
	}
}

// forceRelevance sets every verdict in rel to v.
func forceRelevance(rel *design.Relevance, v bool) {
	rel.Today = v
	for draftID := range rel.Drafts {
		rel.Drafts[draftID] = v
	}
}

// lowerSet returns the names lowercased, as a set.
func lowerSet(names []string) map[string]bool {
	out := make(map[string]bool, len(names))
	for _, n := range names {
		out[strings.ToLower(n)] = true
	}
	return out
}
