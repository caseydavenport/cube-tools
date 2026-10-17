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
			{ID: 1, Player: "Alice", Matches: []Match{{Opponent: "Bob", OpponentID: 2, Wins: 2, Losses: 0}}},
			{ID: 2, Player: "Bob", Matches: []Match{{Opponent: "Alice", OpponentID: 1, Wins: 0, Losses: 2}}},
		}
		changed := ReconcileRecord(decks, 1, "", []Match{{Opponent: "Bob", OpponentID: 2, Wins: 2, Losses: 1, Draws: 1}})

		alice := findDeck(decks, "Alice")
		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{{Opponent: "Bob", OpponentID: 2, Wins: 2, Losses: 1, Draws: 1}}, alice.Matches)
		assert.Equal(t, []Match{{Opponent: "Alice", OpponentID: 1, Wins: 1, Losses: 2, Draws: 1}}, bob.Matches)
		assert.Len(t, changed, 2)
	})

	t.Run("mirror replaces the opponent's existing match", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice", Matches: []Match{{Opponent: "Bob", OpponentID: 2, Wins: 2, Losses: 0}}},
			{ID: 2, Player: "Bob", Matches: []Match{
				{Opponent: "Alice", OpponentID: 1, Wins: 0, Losses: 2},
				{Opponent: "Sue", OpponentID: 3, Wins: 2, Losses: 1},
			}},
		}
		ReconcileRecord(decks, 1, "", []Match{{Opponent: "Bob", OpponentID: 2, Wins: 1, Losses: 2}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{
			{Opponent: "Sue", OpponentID: 3, Wins: 2, Losses: 1},
			{Opponent: "Alice", OpponentID: 1, Wins: 2, Losses: 1},
		}, bob.Matches)
	})

	t.Run("mirror replaces an opponent match recorded by name only", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice"},
			{ID: 2, Player: "Bob", Matches: []Match{{Opponent: "Alice", Wins: 0, Losses: 2}}},
		}
		ReconcileRecord(decks, 1, "", []Match{{Opponent: "Bob", OpponentID: 2, Wins: 1, Losses: 2}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{{Opponent: "Alice", OpponentID: 1, Wins: 2, Losses: 1}}, bob.Matches)
	})

	t.Run("mirror carries the actual winner unchanged", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice"},
			{ID: 2, Player: "Bob"},
		}
		ReconcileRecord(decks, 1, "", []Match{{Opponent: "Bob", OpponentID: 2, Wins: 2, Losses: 1, Winner: "Alice"}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{{Opponent: "Alice", OpponentID: 1, Wins: 1, Losses: 2, Winner: "Alice"}}, bob.Matches)
	})

	t.Run("mirror mirrors nested games", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice"},
			{ID: 2, Player: "Bob"},
		}
		ReconcileRecord(decks, 1, "", []Match{{
			Opponent: "Bob", OpponentID: 2, Wins: 1, Losses: 1,
			Games: []Game{{Opponent: "Bob", Winner: "Alice"}, {Opponent: "Bob", Winner: "Bob"}},
		}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Game{{Opponent: "Alice", Winner: "Alice"}, {Opponent: "Alice", Winner: "Bob"}}, bob.Matches[0].Games)
	})

	t.Run("mirror keeps round and games", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice"},
			{ID: 2, Player: "Bob"},
		}
		ReconcileRecord(decks, 1, "", []Match{{
			Opponent: "Bob", OpponentID: 2, Round: 3, Wins: 2,
			Games: []Game{{Opponent: "Bob", Winner: "Alice"}, {Opponent: "Bob", Winner: "Alice"}},
		}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, 3, bob.Matches[0].Round)
		assert.Len(t, bob.Matches[0].Games, 2)
	})

	t.Run("opponent id is the truth and refreshes a stale name", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice"},
			{ID: 2, Player: "Bob"},
		}
		changed := ReconcileRecord(decks, 1, "", []Match{{Opponent: "Robert", OpponentID: 2, Round: 1, Wins: 2, Losses: 1}})

		alice := findDeck(decks, "Alice")
		bob := findDeck(decks, "Bob")
		assert.Len(t, changed, 2)
		assert.Equal(t, "Bob", alice.Matches[0].Opponent)
		assert.Equal(t, []Match{{Opponent: "Alice", OpponentID: 1, Round: 1, Wins: 1, Losses: 2}}, bob.Matches)
	})

	t.Run("opponent without an id is found by name", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice"},
			{ID: 2, Player: "Bob"},
		}
		ReconcileRecord(decks, 1, "", []Match{{Opponent: "Bob", Wins: 2}})

		alice := findDeck(decks, "Alice")
		bob := findDeck(decks, "Bob")
		assert.Equal(t, 2, alice.Matches[0].OpponentID)
		assert.Equal(t, 1, bob.Matches[0].OpponentID)
		assert.Equal(t, "Alice", bob.Matches[0].Opponent)
	})

	t.Run("opponent not in draft is skipped", func(t *testing.T) {
		decks := []*Deck{{ID: 1, Player: "Alice"}}
		changed := ReconcileRecord(decks, 1, "", []Match{{Opponent: "Ghost", Wins: 2, Losses: 0}})
		assert.Len(t, changed, 1)
		assert.Equal(t, "Alice", changed[0].Player)
		assert.Equal(t, 0, changed[0].Matches[0].OpponentID)
	})

	t.Run("override stubs do not mirror", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice"},
			{ID: 2, Player: "Bob", Matches: []Match{{Opponent: "Alice", OpponentID: 1, Wins: 0, Losses: 2}}},
		}
		changed := ReconcileRecord(decks, 1, "", []Match{{Wins: 1}, {Wins: 1}, {Losses: 1}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{{Opponent: "Alice", OpponentID: 1, Wins: 0, Losses: 2}}, bob.Matches)
		assert.Len(t, changed, 1)
	})

	t.Run("rename propagates opponent and winner across draft", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice", Matches: []Match{{Opponent: "Bob", OpponentID: 2, Wins: 2, Losses: 0, Winner: "Alice"}}},
			{ID: 2, Player: "Bob", Matches: []Match{{
				Opponent: "Alice", OpponentID: 1, Wins: 0, Losses: 2, Winner: "Alice",
				Games: []Game{{Opponent: "Alice", Winner: "Alice"}},
			}}},
			{ID: 3, Player: "Sue", Matches: []Match{{Opponent: "Alice", OpponentID: 1, Wins: 1, Losses: 2, Winner: "Alice"}}},
		}
		changed := ReconcileRecord(decks, 1, "casey", nil)

		casey := findDeck(decks, "casey")
		assert.Equal(t, 1, casey.ID)
		bob := findDeck(decks, "Bob")
		assert.Equal(t, "casey", bob.Matches[0].Opponent)
		assert.Equal(t, "casey", bob.Matches[0].Winner)
		assert.Equal(t, "casey", bob.Matches[0].Games[0].Opponent)
		assert.Equal(t, "casey", bob.Matches[0].Games[0].Winner)
		sue := findDeck(decks, "Sue")
		assert.Equal(t, "casey", sue.Matches[0].Opponent)
		assert.Len(t, changed, 3)
	})

	t.Run("rename-only keeps the record", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice", Matches: []Match{{Opponent: "Bob", OpponentID: 2, Wins: 2, Losses: 0}}},
			{ID: 2, Player: "Bob", Matches: []Match{{Opponent: "Alice", OpponentID: 1, Wins: 0, Losses: 2}}},
		}
		ReconcileRecord(decks, 1, "casey", nil)

		casey := findDeck(decks, "casey")
		assert.Equal(t, []Match{{Opponent: "Bob", OpponentID: 2, Wins: 2, Losses: 0}}, casey.Matches)
		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{{Opponent: "casey", OpponentID: 1, Wins: 0, Losses: 2}}, bob.Matches)
	})

	t.Run("changing an opponent drops the old opponent's mirror", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice", Matches: []Match{{Opponent: "Bob", OpponentID: 2, Round: 2, Wins: 2}}},
			{ID: 2, Player: "Bob", Matches: []Match{
				{Opponent: "Alice", OpponentID: 1, Round: 2, Losses: 2},
				{Opponent: "Carol", OpponentID: 3, Round: 1, Wins: 2},
			}},
			{ID: 3, Player: "Carol"},
		}
		changed := ReconcileRecord(decks, 1, "", []Match{{Opponent: "Carol", OpponentID: 3, Round: 2, Wins: 2}})

		bob := findDeck(decks, "Bob")
		assert.Equal(t, []Match{{Opponent: "Carol", OpponentID: 3, Round: 1, Wins: 2}}, bob.Matches)
		carol := findDeck(decks, "Carol")
		assert.Equal(t, []Match{{Opponent: "Alice", OpponentID: 1, Round: 2, Losses: 2}}, carol.Matches)
		assert.Len(t, changed, 3)
	})

	t.Run("deleting a row drops that opponent's mirror", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice", Matches: []Match{
				{Opponent: "Bob", OpponentID: 2, Round: 1, Wins: 2},
				{Opponent: "Carol", OpponentID: 3, Round: 2, Wins: 2},
			}},
			{ID: 2, Player: "Bob", Matches: []Match{{Opponent: "Alice", OpponentID: 1, Round: 1, Losses: 2}}},
			{ID: 3, Player: "Carol", Matches: []Match{{Opponent: "Alice", OpponentID: 1, Round: 2, Losses: 2}}},
		}
		ReconcileRecord(decks, 1, "", []Match{{Opponent: "Carol", OpponentID: 3, Round: 2, Wins: 2}})

		assert.Empty(t, findDeck(decks, "Bob").Matches)
	})

	t.Run("switching to override stubs leaves opponents it never listed alone", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Alice", Matches: []Match{{Wins: 1}}},
			{ID: 2, Player: "Bob", Matches: []Match{{Opponent: "Alice", OpponentID: 1, Losses: 2}}},
		}
		changed := ReconcileRecord(decks, 1, "", []Match{{Wins: 1}, {Losses: 1}})

		assert.Len(t, findDeck(decks, "Bob").Matches, 1)
		assert.Len(t, changed, 1)
	})

	t.Run("unknown target id returns nil", func(t *testing.T) {
		decks := []*Deck{{ID: 1, Player: "Alice"}}
		assert.Nil(t, ReconcileRecord(decks, 9, "x", nil))
	})
}
