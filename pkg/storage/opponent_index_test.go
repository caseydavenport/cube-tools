package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/types"
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

func TestOpponentIndexPrefersOpponentID(t *testing.T) {
	alice := makeStorageDeck("alice", "d1", "2026-01-01", nil, nil, nil)
	alice.ID = 1
	bob := makeStorageDeck("bob", "d1", "2026-01-01", nil, nil, nil)
	bob.ID = 2
	idx := NewOpponentIndex([]*Deck{alice, bob})

	// The name is stale; the id still finds Bob.
	got, ok := idx.MatchOpponent(alice, types.Match{Opponent: "robert", OpponentID: 2})
	assert.True(t, ok)
	assert.Same(t, bob, got)

	_, ok = idx.MatchOpponent(alice, types.Match{Opponent: "bob", OpponentID: 7})
	assert.False(t, ok)
}

func TestOpponentIndexFallsBackToName(t *testing.T) {
	alice := makeStorageDeck("alice", "d1", "2026-01-01", nil, nil, nil)
	alice.ID = 1
	bob := makeStorageDeck("bob", "d1", "2026-01-01", nil, nil, nil)
	bob.ID = 2
	idx := NewOpponentIndex([]*Deck{alice, bob})

	got, ok := idx.MatchOpponent(alice, types.Match{Opponent: "bob"})
	assert.True(t, ok)
	assert.Same(t, bob, got)
}

func TestEnrichFindsOpponentByID(t *testing.T) {
	// Bob's name in Alice's match is stale, so only the id can find him.
	alice := makeStorageDeck("alice", "d1", "2026-01-01", nil, []types.Match{{Opponent: "robert", OpponentID: 2, Wins: 2}}, nil)
	alice.ID = 1
	bob := makeStorageDeck("bob", "d1", "2026-01-01", nil, []types.Match{
		{Opponent: "alice", OpponentID: 1, Losses: 2},
		{Opponent: "carol", OpponentID: 3, Wins: 2},
	}, nil)
	bob.ID = 2
	Enrich([]*Deck{alice, bob})
	assert.Equal(t, 100.0, alice.OpponentWinPercentage)
}
