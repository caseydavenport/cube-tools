package storage

import (
	"os"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func makeStorageDeck(player, draftID, date string, games []types.Game, matches []types.Match, labels []string) *Deck {
	d := &Deck{}
	d.Player = player
	d.Metadata.DraftID = draftID
	d.Date = date
	d.Matches = matches
	d.Labels = labels

	// Fold games into the matching Match by opponent, tallying Wins/Losses/Draws.
	for _, g := range games {
		placed := false
		for i := range d.Matches {
			if d.Matches[i].Opponent == g.Opponent {
				d.Matches[i].Games = append(d.Matches[i].Games, g)
				switch {
				case g.Winner == player:
					d.Matches[i].Wins++
				case g.Winner == "" || g.Tie:
					d.Matches[i].Draws++
				default:
					d.Matches[i].Losses++
				}
				placed = true
				break
			}
		}
		if !placed {
			m := types.Match{Opponent: g.Opponent, Games: []types.Game{g}}
			switch {
			case g.Winner == player:
				m.Wins = 1
			case g.Winner == "" || g.Tie:
				m.Draws = 1
			default:
				m.Losses = 1
			}
			d.Matches = append(d.Matches, m)
		}
	}

	// Storage Deck still carries a flat Games slice (populated by process()), keep tests consistent.
	d.Games = make([]types.Game, 0)
	for _, m := range d.Matches {
		d.Games = append(d.Games, m.Games...)
	}
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

// A match that recorded only aggregate Win/Loss/Draw counts (no per-game rows)
// still yields flattened games, so consumers that walk deck.Games count it.
func TestProcess_SynthesizesGamesFromMatchCounts(t *testing.T) {
	d := &Deck{}
	d.Player = "Alice"
	d.Metadata.DraftID = "draft1"
	d.Matches = []types.Match{
		{Opponent: "Bob", Wins: 2, Losses: 1},
		{Opponent: "Carol", Wins: 0, Losses: 1, Draws: 1},
	}

	process(map[key]*Deck{{player: "Alice", draft: "draft1"}: d})

	assert.Len(t, d.Games, 5) // 2+1 + 0+1+1
	wins, losses, draws := 0, 0, 0
	for _, g := range d.Games {
		assert.Contains(t, []string{"Bob", "Carol"}, g.Opponent)
		switch {
		case g.Tie:
			draws++
		case g.Winner == "Alice":
			wins++
		default:
			losses++
			assert.NotEqual(t, "Alice", g.Winner) // opponent stands in as winner
		}
	}
	assert.Equal(t, 2, wins)
	assert.Equal(t, 2, losses)
	assert.Equal(t, 1, draws)
	assert.Equal(t, 2, d.Stats.GameWins)
	assert.Equal(t, 2, d.Stats.GameLosses)
	assert.Equal(t, 1, d.Stats.GameDraws)
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

// Playing the same opponent twice (e.g. round 1 and a finals rematch) used to
// double-count that opponent in the OWP average. Each unique opponent should
// contribute exactly once.
func TestProcess_OpponentWinPercentage_NoDoubleCountRematches(t *testing.T) {
	// Alice plays Bob twice. Bob plays Charlie once besides Alice.
	// Bob's games excluding vs Alice: 0-2 vs Charlie = 0%.
	// If Bob were double-counted, OWP would still be 0 - so we use Charlie as
	// the second opponent to make the bug visible.
	// Alice plays Bob twice + Charlie once.
	// Bob's record excluding Alice: 0-2 vs Charlie = 0%.
	// Charlie's record excluding Alice: 2-0 vs Bob = 100%.
	// Correct OWP = (0 + 100) / 2 = 50. Buggy (Bob counted twice) = 33.
	alice := makeStorageDeck("Alice", "draft1", "2024-01-01",
		[]types.Game{
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Alice"},
			{Opponent: "Charlie", Winner: "Alice"},
		},
		[]types.Match{
			{Opponent: "Bob", Round: 1, Winner: "Alice"},
			{Opponent: "Bob", Round: 3, Winner: "Alice"}, // rematch
			{Opponent: "Charlie", Round: 2, Winner: "Alice"},
		},
		nil,
	)
	bob := makeStorageDeck("Bob", "draft1", "2024-01-01",
		[]types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Charlie", Winner: "Charlie"},
			{Opponent: "Charlie", Winner: "Charlie"},
		},
		[]types.Match{
			{Opponent: "Alice", Round: 1, Winner: "Alice"},
			{Opponent: "Alice", Round: 3, Winner: "Alice"},
			{Opponent: "Charlie", Round: 2, Winner: "Charlie"},
		},
		nil,
	)
	charlie := makeStorageDeck("Charlie", "draft1", "2024-01-01",
		[]types.Game{
			{Opponent: "Alice", Winner: "Alice"},
			{Opponent: "Bob", Winner: "Charlie"},
			{Opponent: "Bob", Winner: "Charlie"},
		},
		[]types.Match{
			{Opponent: "Alice", Round: 2, Winner: "Alice"},
			{Opponent: "Bob", Round: 1, Winner: "Charlie"},
		},
		nil,
	)

	lookup := map[key]*Deck{
		{player: "Alice", draft: "draft1"}:   alice,
		{player: "Bob", draft: "draft1"}:     bob,
		{player: "Charlie", draft: "draft1"}: charlie,
	}
	process(lookup)

	assert.InDelta(t, 50.0, alice.OpponentWinPercentage, 0.5)
}

// Legacy matches store the game tally on Match.Wins/Losses without a nested
// games array. Opponents whose record is entirely legacy used to be skipped
// because the per-game flatten produced an empty Games slice for them.
func TestProcess_OpponentWinPercentage_LegacyMatchesIncluded(t *testing.T) {
	// Alice played Bob. Bob also played Charlie in a legacy-style match
	// (no nested Games, just Wins/Losses).
	alice := &Deck{}
	alice.Player = "Alice"
	alice.Date = "2024-01-01"
	alice.Matches = []types.Match{
		{Opponent: "Bob", Round: 1, Wins: 2, Losses: 0, Winner: "Alice",
			Games: []types.Game{
				{Opponent: "Bob", Winner: "Alice"},
				{Opponent: "Bob", Winner: "Alice"},
			}},
	}

	bob := &Deck{}
	bob.Player = "Bob"
	bob.Date = "2024-01-01"
	bob.Matches = []types.Match{
		{Opponent: "Alice", Round: 1, Wins: 0, Losses: 2, Winner: "Alice",
			Games: []types.Game{
				{Opponent: "Alice", Winner: "Alice"},
				{Opponent: "Alice", Winner: "Alice"},
			}},
		// Legacy match: no nested games, just the tally.
		{Opponent: "Charlie", Round: 2, Wins: 2, Losses: 1, Winner: "Bob"},
	}

	charlie := &Deck{}
	charlie.Player = "Charlie"
	charlie.Date = "2024-01-01"
	charlie.Matches = []types.Match{
		{Opponent: "Bob", Round: 2, Wins: 1, Losses: 2, Winner: "Bob"},
	}

	lookup := map[key]*Deck{
		{player: "Alice", draft: "draft1"}:   alice,
		{player: "Bob", draft: "draft1"}:     bob,
		{player: "Charlie", draft: "draft1"}: charlie,
	}
	process(lookup)

	// Bob's record excluding Alice: 2-1 vs Charlie (legacy) = 66.67%.
	// Alice's only opponent is Bob, so OWP = 67.
	assert.InDelta(t, 67.0, alice.OpponentWinPercentage, 0.5)
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

func TestDeckStore_ScopedByCube(t *testing.T) {
	// Tests run with CWD=pkg/storage; chdir to repo root so loadDecks can find
	// the data directory.
	if _, err := os.Stat("data/polyverse/index.json"); err != nil {
		if err := os.Chdir("../.."); err != nil {
			t.Fatal(err)
		}
	}

	s := &deckStore{}
	// polyverse has a real index.json on disk; aurora does not. Both calls are
	// exercised to verify the cache map tracks independent entries. Because
	// errors are not cached (we only store on success), we only assert the
	// polyverse entry — that's the one guaranteed to succeed.
	_, _ = s.List("polyverse", &DecksRequest{})
	_, _ = s.List("aurora", &DecksRequest{})
	if _, ok := s.caches["polyverse"]; !ok {
		t.Fatal("expected cache entry for polyverse")
	}
}
