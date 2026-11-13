package rulebook

import (
	"errors"

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
func snapshotNames(store storage.DeckStorage, cubeID string, draftID int) (design.CardCounts, bool) {
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
	return CountCards(snapshot.Cards), true
}

// loadCardLists reads today's list and the snapshot of every draft the decks
// came from, counting each card's copies.
func loadCardLists(store storage.DeckStorage, cubeID string, cube *types.Cube, decks []*storage.Deck) cardLists {
	lists := cardLists{today: CountCards(cube.Cards), drafts: map[int]design.CardCounts{}}
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
func (l cardLists) known() map[int]map[string]bool {
	out := map[int]map[string]bool{}
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

// CountCards counts the copies of each card in a list.
func CountCards(cards []types.Card) design.CardCounts {
	out := design.CardCounts{}
	for _, c := range cards {
		out[c.Name]++
	}
	return out
}
