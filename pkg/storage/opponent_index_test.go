package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestOpponentIndex(t *testing.T) {
	// Two drafts, each with the same player names, so the (draftID, player) key
	// has to keep them apart.
	freddie1 := makeStorageDeck("freddie", 1, "2026-01-01", nil, nil, nil)
	joan1 := makeStorageDeck("joan", 1, "2026-01-01", nil, nil, nil)
	freddie2 := makeStorageDeck("freddie", 2, "2026-02-02", nil, nil, nil)

	idx := NewOpponentIndex([]*Deck{freddie1, joan1, freddie2})

	t.Run("resolves opponent within the same draft", func(t *testing.T) {
		got, ok := idx.OpponentDeck(freddie1, "joan")
		assert.True(t, ok)
		assert.Same(t, joan1, got)
	})

	t.Run("does not match an opponent from another draft", func(t *testing.T) {
		_, ok := idx.OpponentDeck(freddie2, "joan")
		assert.False(t, ok)
	})

	t.Run("unknown opponent", func(t *testing.T) {
		_, ok := idx.OpponentDeck(freddie1, "stevie")
		assert.False(t, ok)
	})

	t.Run("empty opponent name", func(t *testing.T) {
		_, ok := idx.OpponentDeck(freddie1, "")
		assert.False(t, ok)
	})

	t.Run("deck with no draft", func(t *testing.T) {
		orphan := makeStorageDeck("ozzy", 0, "", nil, nil, nil)
		_, ok := idx.OpponentDeck(orphan, "joan")
		assert.False(t, ok)
	})
}

func TestOpponentIndexPrefersOpponentID(t *testing.T) {
	freddie := makeStorageDeck("freddie", 1, "2026-01-01", nil, nil, nil)
	freddie.ID = 1
	joan := makeStorageDeck("joan", 1, "2026-01-01", nil, nil, nil)
	joan.ID = 2
	idx := NewOpponentIndex([]*Deck{freddie, joan})

	// The name is stale; the id still finds Joan.
	got, ok := idx.MatchOpponent(freddie, types.Match{Opponent: "joanie", OpponentID: 2})
	assert.True(t, ok)
	assert.Same(t, joan, got)

	_, ok = idx.MatchOpponent(freddie, types.Match{Opponent: "joan", OpponentID: 7})
	assert.False(t, ok)
}

func TestOpponentIndexFallsBackToName(t *testing.T) {
	freddie := makeStorageDeck("freddie", 1, "2026-01-01", nil, nil, nil)
	freddie.ID = 1
	joan := makeStorageDeck("joan", 1, "2026-01-01", nil, nil, nil)
	joan.ID = 2
	idx := NewOpponentIndex([]*Deck{freddie, joan})

	got, ok := idx.MatchOpponent(freddie, types.Match{Opponent: "joan"})
	assert.True(t, ok)
	assert.Same(t, joan, got)
}

func TestEnrichFindsOpponentByID(t *testing.T) {
	// Joan's name in Freddie's match is stale, so only the id can find him.
	freddie := makeStorageDeck("freddie", 1, "2026-01-01", nil, []types.Match{{Opponent: "joanie", OpponentID: 2, Wins: 2}}, nil)
	freddie.ID = 1
	joan := makeStorageDeck("joan", 1, "2026-01-01", nil, []types.Match{
		{Opponent: "freddie", OpponentID: 1, Losses: 2},
		{Opponent: "stevie", OpponentID: 3, Wins: 2},
	}, nil)
	joan.ID = 2
	Enrich([]*Deck{freddie, joan})
	assert.Equal(t, 100.0, freddie.OpponentWinPercentage)
}
