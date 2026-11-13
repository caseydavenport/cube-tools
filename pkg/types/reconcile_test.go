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
			{ID: 1, Player: "Freddie", Matches: []Match{{Opponent: "Ozzy", OpponentID: 2, Wins: 2, Losses: 0}}},
			{ID: 2, Player: "Ozzy", Matches: []Match{{Opponent: "Freddie", OpponentID: 1, Wins: 0, Losses: 2}}},
		}
		changed := ReconcileRecord(decks, 1, []Match{{Opponent: "Ozzy", OpponentID: 2, Wins: 2, Losses: 1, Draws: 1}})

		freddie := findDeck(decks, "Freddie")
		ozzy := findDeck(decks, "Ozzy")
		assert.Equal(t, []Match{{Opponent: "Ozzy", OpponentID: 2, Wins: 2, Losses: 1, Draws: 1}}, freddie.Matches)
		assert.Equal(t, []Match{{Opponent: "Freddie", OpponentID: 1, Wins: 1, Losses: 2, Draws: 1}}, ozzy.Matches)
		assert.Len(t, changed, 2)
	})

	t.Run("mirror replaces the opponent's existing match", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie", Matches: []Match{{Opponent: "Ozzy", OpponentID: 2, Wins: 2, Losses: 0}}},
			{ID: 2, Player: "Ozzy", Matches: []Match{
				{Opponent: "Freddie", OpponentID: 1, Wins: 0, Losses: 2},
				{Opponent: "Sue", OpponentID: 3, Wins: 2, Losses: 1},
			}},
		}
		ReconcileRecord(decks, 1, []Match{{Opponent: "Ozzy", OpponentID: 2, Wins: 1, Losses: 2}})

		ozzy := findDeck(decks, "Ozzy")
		assert.Equal(t, []Match{
			{Opponent: "Sue", OpponentID: 3, Wins: 2, Losses: 1},
			{Opponent: "Freddie", OpponentID: 1, Wins: 2, Losses: 1},
		}, ozzy.Matches)
	})

	t.Run("mirror carries the actual winner unchanged", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie"},
			{ID: 2, Player: "Ozzy"},
		}
		ReconcileRecord(decks, 1, []Match{{Opponent: "Ozzy", OpponentID: 2, Wins: 2, Losses: 1, Winner: "Freddie"}})

		ozzy := findDeck(decks, "Ozzy")
		assert.Equal(t, []Match{{Opponent: "Freddie", OpponentID: 1, Wins: 1, Losses: 2, Winner: "Freddie"}}, ozzy.Matches)
	})

	t.Run("mirror mirrors nested games", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie"},
			{ID: 2, Player: "Ozzy"},
		}
		ReconcileRecord(decks, 1, []Match{{
			Opponent: "Ozzy", OpponentID: 2, Wins: 1, Losses: 1,
			Games: []Game{{Opponent: "Ozzy", Winner: "Freddie", Won: true}, {Opponent: "Ozzy", Winner: "Ozzy"}, {Tie: true}},
		}})

		ozzy := findDeck(decks, "Ozzy")
		assert.Equal(t, []Game{
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Freddie", Winner: "Ozzy", Won: true},
			{Opponent: "Freddie", Tie: true},
		}, ozzy.Matches[0].Games)
	})

	t.Run("an opponent named but without an id is a stub", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie"},
			{ID: 2, Player: "Ozzy"},
		}
		changed := ReconcileRecord(decks, 1, []Match{{Opponent: "Ozzy", Wins: 2}})

		assert.Len(t, changed, 1)
		assert.Empty(t, findDeck(decks, "Ozzy").Matches)
		assert.Equal(t, 0, findDeck(decks, "Freddie").Matches[0].OpponentID)
	})

	t.Run("mirror keeps round and games", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie"},
			{ID: 2, Player: "Ozzy"},
		}
		ReconcileRecord(decks, 1, []Match{{
			Opponent: "Ozzy", OpponentID: 2, Round: 3, Wins: 2,
			Games: []Game{{Opponent: "Ozzy", Winner: "Freddie"}, {Opponent: "Ozzy", Winner: "Freddie"}},
		}})

		ozzy := findDeck(decks, "Ozzy")
		assert.Equal(t, 3, ozzy.Matches[0].Round)
		assert.Len(t, ozzy.Matches[0].Games, 2)
	})

	t.Run("opponent id is the truth and refreshes a stale name", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie"},
			{ID: 2, Player: "Ozzy"},
		}
		changed := ReconcileRecord(decks, 1, []Match{{Opponent: "Robert", OpponentID: 2, Round: 1, Wins: 2, Losses: 1}})

		freddie := findDeck(decks, "Freddie")
		ozzy := findDeck(decks, "Ozzy")
		assert.Len(t, changed, 2)
		assert.Equal(t, "Ozzy", freddie.Matches[0].Opponent)
		assert.Equal(t, []Match{{Opponent: "Freddie", OpponentID: 1, Round: 1, Wins: 1, Losses: 2}}, ozzy.Matches)
	})

	t.Run("opponent not in draft is skipped", func(t *testing.T) {
		decks := []*Deck{{ID: 1, Player: "Freddie"}}
		changed := ReconcileRecord(decks, 1, []Match{{Opponent: "Ghost", Wins: 2, Losses: 0}})
		assert.Len(t, changed, 1)
		assert.Equal(t, "Freddie", changed[0].Player)
		assert.Equal(t, 0, changed[0].Matches[0].OpponentID)
	})

	t.Run("override stubs do not mirror", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie"},
			{ID: 2, Player: "Ozzy", Matches: []Match{{Opponent: "Freddie", OpponentID: 1, Wins: 0, Losses: 2}}},
		}
		changed := ReconcileRecord(decks, 1, []Match{{Wins: 1}, {Wins: 1}, {Losses: 1}})

		ozzy := findDeck(decks, "Ozzy")
		assert.Equal(t, []Match{{Opponent: "Freddie", OpponentID: 1, Wins: 0, Losses: 2}}, ozzy.Matches)
		assert.Len(t, changed, 1)
	})

	t.Run("changing an opponent drops the old opponent's mirror", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie", Matches: []Match{{Opponent: "Ozzy", OpponentID: 2, Round: 2, Wins: 2}}},
			{ID: 2, Player: "Ozzy", Matches: []Match{
				{Opponent: "Freddie", OpponentID: 1, Round: 2, Losses: 2},
				{Opponent: "Debbie", OpponentID: 3, Round: 1, Wins: 2},
			}},
			{ID: 3, Player: "Debbie"},
		}
		changed := ReconcileRecord(decks, 1, []Match{{Opponent: "Debbie", OpponentID: 3, Round: 2, Wins: 2}})

		ozzy := findDeck(decks, "Ozzy")
		assert.Equal(t, []Match{{Opponent: "Debbie", OpponentID: 3, Round: 1, Wins: 2}}, ozzy.Matches)
		debbie := findDeck(decks, "Debbie")
		assert.Equal(t, []Match{{Opponent: "Freddie", OpponentID: 1, Round: 2, Losses: 2}}, debbie.Matches)
		assert.Len(t, changed, 3)
	})

	t.Run("deleting a row drops that opponent's mirror", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie", Matches: []Match{
				{Opponent: "Ozzy", OpponentID: 2, Round: 1, Wins: 2},
				{Opponent: "Debbie", OpponentID: 3, Round: 2, Wins: 2},
			}},
			{ID: 2, Player: "Ozzy", Matches: []Match{{Opponent: "Freddie", OpponentID: 1, Round: 1, Losses: 2}}},
			{ID: 3, Player: "Debbie", Matches: []Match{{Opponent: "Freddie", OpponentID: 1, Round: 2, Losses: 2}}},
		}
		ReconcileRecord(decks, 1, []Match{{Opponent: "Debbie", OpponentID: 3, Round: 2, Wins: 2}})

		assert.Empty(t, findDeck(decks, "Ozzy").Matches)
	})

	t.Run("switching to override stubs leaves opponents it never listed alone", func(t *testing.T) {
		decks := []*Deck{
			{ID: 1, Player: "Freddie", Matches: []Match{{Wins: 1}}},
			{ID: 2, Player: "Ozzy", Matches: []Match{{Opponent: "Freddie", OpponentID: 1, Losses: 2}}},
		}
		changed := ReconcileRecord(decks, 1, []Match{{Wins: 1}, {Losses: 1}})

		assert.Len(t, findDeck(decks, "Ozzy").Matches, 1)
		assert.Len(t, changed, 1)
	})

	t.Run("unknown target id returns nil", func(t *testing.T) {
		decks := []*Deck{{ID: 1, Player: "Freddie"}}
		assert.Nil(t, ReconcileRecord(decks, 9, nil))
	})
}
