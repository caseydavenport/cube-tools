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
	today  map[string]bool
	drafts map[int]map[string]bool
}

// snapshotNames reads a draft's cube list as card names. found is false when
// the draft has no snapshot; an empty snapshot gives found true and nil names.
func snapshotNames(store storage.DeckStorage, cubeID string, draftID int) (names map[string]bool, found bool) {
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
	return cardNames(snapshot), true
}

// cardNames returns a cube list's card names as a set.
func cardNames(cube *types.Cube) map[string]bool {
	names := make(map[string]bool, len(cube.Cards))
	for _, c := range cube.Cards {
		names[c.Name] = true
	}
	return names
}

// loadCardLists reads today's list and the snapshot of every draft the decks
// came from.
func loadCardLists(store storage.DeckStorage, cubeID string, cube *types.Cube, decks []*storage.Deck) cardLists {
	lists := cardLists{today: cardNames(cube), drafts: map[int]map[string]bool{}}
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

// snapshotOnlyNames returns the cards in the drafts' lists that aren't in
// today's, so cut cards no deck played still resolve into groups.
func (l cardLists) snapshotOnlyNames() []string {
	seen := map[string]bool{}
	var out []string
	for _, names := range l.drafts {
		for name := range names {
			if l.today[name] || seen[name] {
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
