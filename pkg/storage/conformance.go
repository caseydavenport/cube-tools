package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// RunDeckConformance checks the deck-storage contract against a Store that the
// caller has already seeded with the canonical dataset: cube "conf" containing
// draft "d1" with Alice (2-0 vs Bob) and Bob (0-2 vs Alice). caps controls which
// optional behaviors are exercised.
func RunDeckConformance(t *testing.T, s *Store, caps Capabilities) {
	t.Helper()

	decks, err := s.List("conf", nil)
	assert.NoError(t, err)
	assert.Len(t, decks, 2)

	byPlayer := map[string]*Deck{}
	for _, d := range decks {
		byPlayer[d.Player] = d
	}
	assert.NotNil(t, byPlayer["Alice"])
	assert.NotNil(t, byPlayer["Bob"])
	assert.Equal(t, 1, byPlayer["Alice"].Stats.MatchWins)
	assert.Equal(t, 1, byPlayer["Bob"].Stats.MatchLosses)
	assert.Len(t, byPlayer["Alice"].Games, 2)

	filtered, err := s.List("conf", &DecksRequest{Player: "Alice"})
	assert.NoError(t, err)
	assert.Len(t, filtered, 1)
	assert.Equal(t, "Alice", filtered[0].Player)

	if caps.WriteMeta {
		updated, err := s.UpdateDeckMeta("conf", "d1", "Alice", "Aggro", []string{"fast"}, nil)
		assert.NoError(t, err)
		assert.Equal(t, "Aggro", updated.MacroArchetype)
		assert.Equal(t, 1, updated.Stats.MatchWins)

		reread, err := s.List("conf", nil)
		assert.NoError(t, err)
		for _, d := range reread {
			if d.Player == "Alice" {
				assert.Equal(t, "Aggro", d.MacroArchetype)
			}
		}
	}
}
