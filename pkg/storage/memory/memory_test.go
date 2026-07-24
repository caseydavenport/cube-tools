package memory

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func deck(player, draft string, matches []types.Match) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draft
	d.Date = "2024-01-01"
	d.Matches = matches
	return d
}

func TestMemoryConformance(t *testing.T) {
	b := New()
	b.Seed("conf",
		deck("Alice", "d1", []types.Match{{Opponent: "Bob", Wins: 2, Losses: 0}}),
		deck("Bob", "d1", []types.Match{{Opponent: "Alice", Wins: 0, Losses: 2}}),
	)
	s := storage.NewStore(b)
	storage.RunDeckConformance(t, s, storage.Detect(b))
}

func TestMemoryBackend_UpdateRoundTrips(t *testing.T) {
	b := New()
	b.Seed("cubeA",
		deck("Alice", "d1", []types.Match{{Opponent: "Bob", Wins: 2, Losses: 0}}),
		deck("Bob", "d1", []types.Match{{Opponent: "Alice", Wins: 0, Losses: 2}}),
	)
	s := storage.NewStore(b)

	_, err := s.UpdateDeckMeta("cubeA", "d1", "Alice", "Aggro", []string{"fast"}, []string{"R"})
	assert.NoError(t, err)

	got, err := s.List("cubeA", nil)
	assert.NoError(t, err)
	var alice *storage.Deck
	for _, d := range got {
		if d.Player == "Alice" {
			alice = d
		}
	}
	assert.NotNil(t, alice)
	assert.Equal(t, "Aggro", alice.MacroArchetype)
	assert.Equal(t, []string{"fast"}, alice.Labels)
}
