package stats

import (
	"errors"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// cardLists is every card list a cube's packages are judged against: today's
// list, and each draft's own. A draft whose snapshot is empty maps to nil,
// and a draft with no snapshot is left out.
type cardLists struct {
	today  design.CardCounts
	drafts map[int]design.CardCounts
}

// snapshotNames reads a draft's cube list as card counts. found is false when
// the draft has no snapshot; an empty snapshot gives found true and nil names.
func snapshotNames(store storage.DeckStorage, cubeID string, draftID int) (names design.CardCounts, found bool) {
	snapshot, err := store.GetSnapshot(cubeID, draftID)
	if err != nil {
		if !errors.Is(err, storage.ErrDeckNotFound) && !errors.Is(err, storage.ErrUnsupported) {
			logrus.WithError(err).WithField("draft", draftID).Warn("could not read cube snapshot")
		}
		return nil, false
	}
	if len(snapshot.Cards) == 0 {
		return nil, true
	}
	return countCards(snapshot.Cards), true
}

// loadCardLists reads today's list and the snapshot of every draft the decks
// came from, counting each card's copies.
func loadCardLists(store storage.DeckStorage, cubeID string, cube *types.Cube, decks []*storage.Deck) cardLists {
	lists := cardLists{today: countCards(cube.Cards), drafts: map[int]design.CardCounts{}}
	tried := map[int]bool{}
	for _, d := range decks {
		draftID := d.Metadata.DraftID
		if tried[draftID] {
			continue
		}
		tried[draftID] = true
		if names, found := snapshotNames(store, cubeID, draftID); found {
			lists.drafts[draftID] = names
		}
	}
	return lists
}

// known returns the drafts whose snapshot lists cards, for checking which
// cards each draft's cube held. Drafts with no snapshot or an empty one are
// left out, which counts every card as available there.
func (l cardLists) known() cubeLists {
	out := cubeLists{}
	for draftID, counts := range l.drafts {
		if counts == nil {
			continue
		}
		names := make(map[string]bool, len(counts))
		for name := range counts {
			names[name] = true
		}
		out[draftID] = names
	}
	return out
}

// snapshotOnlyNames returns the cards in the drafts' lists that aren't in
// today's, so cut cards no deck played still resolve into groups.
func (l cardLists) snapshotOnlyNames() []string {
	seen := map[string]bool{}
	var out []string
	for _, names := range l.drafts {
		for name := range names {
			if l.today[name] > 0 || seen[name] {
				continue
			}
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
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

// draftIDsOf returns the distinct drafts the decks came from.
func draftIDsOf(decks []*storage.Deck) []int {
	seen := map[int]bool{}
	var out []int
	for _, d := range decks {
		id := d.Metadata.DraftID
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// relevantInAny keeps packages relevant in any of the drafts, or on today's
// list when there are none, for views over a range of decks.
func relevantInAny(draftIDs []int) func(*design.Relevance) bool {
	return func(r *design.Relevance) bool { return r.InAny(draftIDs) }
}

// relevantInDraft keeps packages relevant in one draft, for a view of one
// deck.
func relevantInDraft(draftID int) func(*design.Relevance) bool {
	return func(r *design.Relevance) bool { return r.InDraft(draftID) }
}

// relevantToday keeps packages relevant on today's list, for views about
// the cube as it is now.
func relevantToday(r *design.Relevance) bool {
	return r.InAny(nil)
}

// relevantConfig returns the rules with only the packages keep accepts, by
// their relevance, so a view built from the config shows only those. Every
// group stays.
func (in designInputs) relevantConfig(keep func(*design.Relevance) bool) design.DesignMapConfig {
	return configFor(in.config, keepPackages(in.packages(), keep))
}

// keepPackages returns the resolved packages keep accepts, by relevance.
func keepPackages(pkgs []design.PackageCards, keep func(*design.Relevance) bool) []design.PackageCards {
	var out []design.PackageCards
	for _, p := range pkgs {
		if keep(p.Relevance) {
			out = append(out, p)
		}
	}
	return out
}

// configFor returns config with only the packages already resolved in pkgs,
// so a view can use both without resolving the rules a second time.
func configFor(config design.DesignMapConfig, pkgs []design.PackageCards) design.DesignMapConfig {
	shown := map[string]bool{}
	for _, p := range pkgs {
		shown[p.Name] = true
	}
	out := config
	out.Packages = nil
	for _, p := range config.Packages {
		if shown[p.Name] {
			out.Packages = append(out.Packages, p)
		}
	}
	return out
}

// forcedState returns "on" or "off" when the overrides force the named
// package, else "".
func forcedState(ov design.PackageOverrides, name string) string {
	lower := strings.ToLower(name)
	if lowerSet(ov.On)[lower] {
		return "on"
	}
	if lowerSet(ov.Off)[lower] {
		return "off"
	}
	return ""
}
