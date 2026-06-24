package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOpponentIndex(t *testing.T) {
	// Two drafts, each with the same player names, so the (draftID, player) key
	// has to keep them apart.
	alice1 := makeStorageDeck("alice", "2026-01-01", "2026-01-01", nil, nil, nil)
	bob1 := makeStorageDeck("bob", "2026-01-01", "2026-01-01", nil, nil, nil)
	alice2 := makeStorageDeck("alice", "2026-02-02", "2026-02-02", nil, nil, nil)

	idx := NewOpponentIndex([]*Deck{alice1, bob1, alice2})

	t.Run("resolves opponent within the same draft", func(t *testing.T) {
		got, ok := idx.OpponentDeck(alice1, "bob")
		assert.True(t, ok)
		assert.Same(t, bob1, got)
	})

	t.Run("does not match an opponent from another draft", func(t *testing.T) {
		_, ok := idx.OpponentDeck(alice2, "bob")
		assert.False(t, ok)
	})

	t.Run("unknown opponent", func(t *testing.T) {
		_, ok := idx.OpponentDeck(alice1, "carol")
		assert.False(t, ok)
	})

	t.Run("empty opponent name", func(t *testing.T) {
		_, ok := idx.OpponentDeck(alice1, "")
		assert.False(t, ok)
	})

	t.Run("deck with no draft", func(t *testing.T) {
		orphan := makeStorageDeck("dave", "", "", nil, nil, nil)
		_, ok := idx.OpponentDeck(orphan, "bob")
		assert.False(t, ok)
	})
}
