package stats

import (
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

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
