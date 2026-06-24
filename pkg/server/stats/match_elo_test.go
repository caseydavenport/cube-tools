package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func eloDeck(player, draftID, date string, mainboard []string, matches []types.Match) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draftID
	d.Date = date
	d.Matches = matches
	for _, n := range mainboard {
		d.Mainboard = append(d.Mainboard, types.Card{Name: n})
	}
	return d
}

func TestMatchELOData_WinLoss(t *testing.T) {
	// Alice beats Bob, all cards start at 1200, so expected = 0.5 and the step is
	// K*(1-0.5) = 12. The match is recorded on both decks; it must be applied
	// once (a 1212 result, not the ~1223 a double-apply would give).
	alice := eloDeck("alice", "d1", "2026-01-01", []string{"Swords", "Brainstorm"}, []types.Match{
		{Opponent: "bob", Winner: "alice"},
	})
	bob := eloDeck("bob", "d1", "2026-01-01", []string{"Lightning Bolt", "Goblin Guide"}, []types.Match{
		{Opponent: "alice", Winner: "alice"},
	})

	elo := MatchELOData([]*storage.Deck{alice, bob})

	assert.Equal(t, 1212, elo["Swords"])
	assert.Equal(t, 1212, elo["Brainstorm"])
	assert.Equal(t, 1188, elo["Lightning Bolt"])
	assert.Equal(t, 1188, elo["Goblin Guide"])
}

func TestMatchELOData_Draw(t *testing.T) {
	// A draw against an equal-rated deck is the expected result, so nothing moves.
	alice := eloDeck("alice", "d1", "2026-01-01", []string{"Swords"}, []types.Match{
		{Opponent: "bob", Wins: 1, Losses: 1},
	})
	bob := eloDeck("bob", "d1", "2026-01-01", []string{"Lightning Bolt"}, []types.Match{
		{Opponent: "alice", Wins: 1, Losses: 1},
	})

	elo := MatchELOData([]*storage.Deck{alice, bob})

	assert.Equal(t, 1200, elo["Swords"])
	assert.Equal(t, 1200, elo["Lightning Bolt"])
}

func TestMatchELOData_ExcludesBasicsAndUnplayed(t *testing.T) {
	alice := eloDeck("alice", "d1", "2026-01-01", []string{"Swords"}, []types.Match{
		{Opponent: "bob", Winner: "alice"},
	})
	alice.Mainboard = append(alice.Mainboard, types.Card{Name: "Plains", Types: []string{"Basic", "Land"}})
	bob := eloDeck("bob", "d1", "2026-01-01", []string{"Lightning Bolt"}, []types.Match{
		{Opponent: "alice", Winner: "alice"},
	})

	elo := MatchELOData([]*storage.Deck{alice, bob})

	_, basicPresent := elo["Plains"]
	assert.False(t, basicPresent, "basic lands should not get a match Elo")

	_, unplayedPresent := elo["Black Lotus"]
	assert.False(t, unplayedPresent, "cards never in a match should be absent")
}

func TestMatchELOData_NoOpponentDeck(t *testing.T) {
	// Opponent isn't in the deck set, so there's nothing to pair against and no
	// rating moves.
	alice := eloDeck("alice", "d1", "2026-01-01", []string{"Swords"}, []types.Match{
		{Opponent: "ghost", Winner: "alice"},
	})

	elo := MatchELOData([]*storage.Deck{alice})

	assert.Empty(t, elo)
}
