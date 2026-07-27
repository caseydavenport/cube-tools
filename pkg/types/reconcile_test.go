package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func findDeck(decks []*Deck, player string) *Deck {
	for _, d := range decks {
		if d.Player == player {
			return d
		}
	}
	return nil
}

func TestReconcileRecord(t *testing.T) {
	t.Run("mirror swaps game counts onto opponent", func(t *testing.T) {
		decks := []*Deck{
			{Player: "Alice", Matches: []Match{{Opponent: "Bob", Wins: 2, Losses: 0}}},
			{Player: "Bob", Matches: []Match{{Opponent: "Alice", Wins: 0, Losses: 2}}},
		}
		changed := ReconcileRecord(decks, "Alice", "", []Match{{Opponent: "Bob", Wins: 2, Losses: 1, Draws: 1}})

		alice := findDeck(decks, "Alice")
		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{{Opponent: "Bob", Wins: 2, Losses: 1, Draws: 1}}, alice.Matches)
		assert.Equal(t, []Match{{Opponent: "Alice", Wins: 1, Losses: 2, Draws: 1}}, bob.Matches)
		assert.Len(t, changed, 2)
	})

	t.Run("mirror replaces the opponent's existing match", func(t *testing.T) {
		decks := []*Deck{
			{Player: "Alice", Matches: []Match{{Opponent: "Bob", Wins: 2, Losses: 0}}},
			{Player: "Bob", Matches: []Match{
				{Opponent: "Alice", Wins: 0, Losses: 2},
				{Opponent: "Sue", Wins: 2, Losses: 1},
			}},
		}
		ReconcileRecord(decks, "Alice", "", []Match{{Opponent: "Bob", Wins: 1, Losses: 2}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{
			{Opponent: "Sue", Wins: 2, Losses: 1},
			{Opponent: "Alice", Wins: 2, Losses: 1},
		}, bob.Matches)
	})

	t.Run("mirror carries the actual winner unchanged", func(t *testing.T) {
		decks := []*Deck{
			{Player: "Alice", Matches: nil},
			{Player: "Bob", Matches: nil},
		}
		ReconcileRecord(decks, "Alice", "", []Match{{Opponent: "Bob", Wins: 2, Losses: 1, Winner: "Alice"}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{{Opponent: "Alice", Wins: 1, Losses: 2, Winner: "Alice"}}, bob.Matches)
	})

	t.Run("mirror mirrors nested games", func(t *testing.T) {
		decks := []*Deck{
			{Player: "Alice"},
			{Player: "Bob"},
		}
		ReconcileRecord(decks, "Alice", "", []Match{{
			Opponent: "Bob", Wins: 1, Losses: 1,
			Games: []Game{{Opponent: "Bob", Winner: "Alice"}, {Opponent: "Bob", Winner: "Bob"}},
		}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Game{{Opponent: "Alice", Winner: "Alice"}, {Opponent: "Alice", Winner: "Bob"}}, bob.Matches[0].Games)
	})

	t.Run("opponent not in draft is skipped", func(t *testing.T) {
		decks := []*Deck{{Player: "Alice"}}
		changed := ReconcileRecord(decks, "Alice", "", []Match{{Opponent: "Ghost", Wins: 2, Losses: 0}})
		assert.Len(t, changed, 1)
		assert.Equal(t, "Alice", changed[0].Player)
	})

	t.Run("override stubs do not mirror", func(t *testing.T) {
		decks := []*Deck{
			{Player: "Alice"},
			{Player: "Bob", Matches: []Match{{Opponent: "Alice", Wins: 0, Losses: 2}}},
		}
		changed := ReconcileRecord(decks, "Alice", "", []Match{{Wins: 1}, {Wins: 1}, {Losses: 1}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{{Opponent: "Alice", Wins: 0, Losses: 2}}, bob.Matches)
		assert.Len(t, changed, 1)
	})

	t.Run("rename propagates opponent and winner across draft", func(t *testing.T) {
		decks := []*Deck{
			{Player: "Alice", Matches: []Match{{Opponent: "Bob", Wins: 2, Losses: 0, Winner: "Alice"}}},
			{Player: "Bob", Matches: []Match{{
				Opponent: "Alice", Wins: 0, Losses: 2, Winner: "Alice",
				Games: []Game{{Opponent: "Alice", Winner: "Alice"}},
			}}},
			{Player: "Sue", Matches: []Match{{Opponent: "Alice", Wins: 1, Losses: 2, Winner: "Alice"}}},
		}
		changed := ReconcileRecord(decks, "Alice", "casey", nil)

		assert.Equal(t, "casey", findDeck(decks, "casey").Player)
		bob := findDeck(decks, "Bob")
		assert.Equal(t, "casey", bob.Matches[0].Opponent)
		assert.Equal(t, "casey", bob.Matches[0].Winner)
		assert.Equal(t, "casey", bob.Matches[0].Games[0].Opponent)
		assert.Equal(t, "casey", bob.Matches[0].Games[0].Winner)
		sue := findDeck(decks, "Sue")
		assert.Equal(t, "casey", sue.Matches[0].Opponent)
		assert.Len(t, changed, 3)
	})

	t.Run("rename-only keeps the record and still mirrors", func(t *testing.T) {
		decks := []*Deck{
			{Player: "Alice", Matches: []Match{{Opponent: "Bob", Wins: 2, Losses: 0}}},
			{Player: "Bob", Matches: []Match{{Opponent: "Alice", Wins: 0, Losses: 2}}},
		}
		ReconcileRecord(decks, "Alice", "casey", nil)

		casey := findDeck(decks, "casey")
		assert.Equal(t, []Match{{Opponent: "Bob", Wins: 2, Losses: 0}}, casey.Matches)
		bob := findDeck(decks, "Bob")
		assert.Equal(t, "casey", bob.Matches[0].Opponent)
		assert.Equal(t, []Match{{Opponent: "casey", Wins: 0, Losses: 2}}, bob.Matches)
	})

	t.Run("missing target returns nil", func(t *testing.T) {
		decks := []*Deck{{Player: "Alice"}}
		assert.Nil(t, ReconcileRecord(decks, "Nobody", "x", nil))
	})
}
