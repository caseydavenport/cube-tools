package storage

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func makeStorageDeck(player, draftID, date string, games []types.Game, matches []types.Match, labels []string) *Deck {
	d := &Deck{}
	d.Player = player
	d.Metadata.DraftID = draftID
	d.Date = date
	d.Games = games
	d.Matches = matches
	d.Labels = labels
	return d
}

// --- process() tests ---

func TestProcess_Stats(t *testing.T) {
	d := makeStorageDeck("Alice", "draft1", "2024-01-01",
		[]types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Bob"},
			{Opponent: "Bob", Winner: "Alice"},
		},
		[]types.Match{
			{Opponent: "Bob", Winner: "Alice"},
		},
		nil,
	)

	lookup := map[key]*Deck{
		{player: "Alice", draft: "draft1"}: d,
	}
	process(lookup)

	assert.Equal(t, 2, d.Stats.GameWins)
	assert.Equal(t, 1, d.Stats.GameLosses)
	assert.Equal(t, 0, d.Stats.GameDraws)
	assert.Equal(t, 1, d.Stats.MatchWins)
	assert.Equal(t, 0, d.Stats.MatchLosses)
	assert.Equal(t, 0, d.Stats.Trophies) // only 1 match win, need >=3
}

func TestProcess_OpponentWinPercentage(t *testing.T) {
	// 4-player draft: Alice, Bob, Charlie, Dave
	// Alice played Bob. Bob's games (excluding vs Alice): 2 games vs Charlie, won 1 → 50%
	alice := makeStorageDeck("Alice", "draft1", "2024-01-01",
		[]types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Alice"},
		},
		[]types.Match{
			{Opponent: "Bob", Winner: "Alice"},
		},
		nil,
	)

	bob := makeStorageDeck("Bob", "draft1", "2024-01-01",
		[]types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Charlie", Winner: "Bob"},
			{Opponent: "Charlie", Winner: "Charlie"},
		},
		[]types.Match{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Charlie", Winner: "Bob"},
		},
		nil,
	)

	charlie := makeStorageDeck("Charlie", "draft1", "2024-01-01",
		[]types.Game{
			{Opponent: "Bob", Winner: "Bob"},
			{Opponent: "Bob", Winner: "Charlie"},
		},
		[]types.Match{
			{Opponent: "Bob", Winner: "Bob"},
		},
		nil,
	)

	lookup := map[key]*Deck{
		{player: "Alice", draft: "draft1"}:   alice,
		{player: "Bob", draft: "draft1"}:     bob,
		{player: "Charlie", draft: "draft1"}: charlie,
	}
	process(lookup)

	// Alice's opponent is Bob. Bob's games excluding vs Alice: vs Charlie (won 1, lost 1) = 50%.
	// OWP = round(100 * 0.5) = 50
	assert.InDelta(t, 50.0, alice.OpponentWinPercentage, 0.5)
}

// --- filter() tests ---

func TestFilter_EmptyRequest(t *testing.T) {
	decks := []*Deck{
		makeStorageDeck("Alice", "d1", "2024-01-01", nil, nil, nil),
		makeStorageDeck("Bob", "d1", "2024-01-01", nil, nil, nil),
	}

	// nil request
	result := filter(decks, nil)
	assert.Equal(t, 2, len(result))

	// empty request
	result = filter(decks, &DecksRequest{})
	assert.Equal(t, 2, len(result))
}

func TestFilter_ByPlayer(t *testing.T) {
	decks := []*Deck{
		makeStorageDeck("Alice", "d1", "2024-01-01", nil, nil, nil),
		makeStorageDeck("Bob", "d1", "2024-01-01", nil, nil, nil),
		makeStorageDeck("alice", "d2", "2024-01-02", nil, nil, nil), // case-insensitive match
	}

	result := filter(decks, &DecksRequest{Player: "Alice"})
	assert.Equal(t, 2, len(result))
	for _, d := range result {
		assert.True(t, d.Player == "Alice" || d.Player == "alice")
	}
}

func TestFilter_ByDateRange(t *testing.T) {
	decks := []*Deck{
		makeStorageDeck("Alice", "d1", "2024-01-01", nil, nil, nil),
		makeStorageDeck("Alice", "d2", "2024-06-15", nil, nil, nil),
		makeStorageDeck("Alice", "d3", "2024-12-31", nil, nil, nil),
	}

	// Start only
	result := filter(decks, &DecksRequest{Start: "2024-06-01"})
	assert.Equal(t, 2, len(result))

	// End only
	result = filter(decks, &DecksRequest{End: "2024-06-30"})
	assert.Equal(t, 2, len(result))

	// Both (inclusive)
	result = filter(decks, &DecksRequest{Start: "2024-06-15", End: "2024-06-15"})
	assert.Equal(t, 1, len(result))
	assert.Equal(t, "2024-06-15", result[0].Date)
}

func TestFilter_ByDraftSize(t *testing.T) {
	d1 := makeStorageDeck("Alice", "d1", "2024-01-01", nil, nil, nil)
	d1.DraftSize = 4
	d2 := makeStorageDeck("Bob", "d2", "2024-01-01", nil, nil, nil)
	d2.DraftSize = 8
	d3 := makeStorageDeck("Charlie", "d3", "2024-01-01", nil, nil, nil)
	d3.DraftSize = 6

	decks := []*Deck{d1, d2, d3}

	result := filter(decks, &DecksRequest{DraftSize: 6})
	assert.Equal(t, 2, len(result))
	for _, d := range result {
		assert.GreaterOrEqual(t, d.DraftSize, 6)
	}
}
