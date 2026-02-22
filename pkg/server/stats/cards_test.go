package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func makeCardDeck(player string, games []types.Game, mainboard []types.Card, sideboard []types.Card) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Games = games
	d.Mainboard = mainboard
	d.Sideboard = sideboard
	return d
}

// --- ExpectedWinPercent ---

func TestExpectedWinPercent(t *testing.T) {
	// Alice played card X in deck 1 (3 wins, 1 loss) and not in deck 2 (2 wins, 2 losses).
	// Bob never played card X: deck 3 (1 win, 3 losses).
	// Players map only includes Alice (because she's the one who mainboarded card X).
	// Expected = Alice's decks without card X = deck 2: 2 wins / 4 games = 50%
	decks := []*storage.Deck{
		makeCardDeck("Alice",
			[]types.Game{
				{Opponent: "Bob", Winner: "Alice"},
				{Opponent: "Bob", Winner: "Alice"},
				{Opponent: "Bob", Winner: "Alice"},
				{Opponent: "Bob", Winner: "Bob"},
			},
			[]types.Card{{Name: "Lightning Bolt"}},
			nil,
		),
		makeCardDeck("Alice",
			[]types.Game{
				{Opponent: "Bob", Winner: "Alice"},
				{Opponent: "Bob", Winner: "Alice"},
				{Opponent: "Bob", Winner: "Bob"},
				{Opponent: "Bob", Winner: "Bob"},
			},
			[]types.Card{{Name: "Counterspell"}}, // no Lightning Bolt
			nil,
		),
		makeCardDeck("Bob",
			[]types.Game{
				{Opponent: "Alice", Winner: "Bob"},
				{Opponent: "Alice", Winner: "Alice"},
				{Opponent: "Alice", Winner: "Alice"},
				{Opponent: "Alice", Winner: "Alice"},
			},
			[]types.Card{{Name: "Goblin Guide"}},
			nil,
		),
	}

	players := map[string]int{"Alice": 2} // Alice mainboarded the card
	result := ExpectedWinPercent("Lightning Bolt", players, decks)

	// Alice's decks without Lightning Bolt: deck 2 has 2 wins, 2 losses → 50%
	assert.InDelta(t, 50.0, result, 0.5)
}

func TestExpectedWinPercent_NoDecks(t *testing.T) {
	result := ExpectedWinPercent("Some Card", map[string]int{}, nil)
	assert.Equal(t, 0.0, result)
}

func TestExpectedWinPercent_SkipsDecksWithCard(t *testing.T) {
	// Both decks have the card → all skipped → 0
	decks := []*storage.Deck{
		makeCardDeck("Alice",
			[]types.Game{{Opponent: "Bob", Winner: "Alice"}},
			[]types.Card{{Name: "Lightning Bolt"}},
			nil,
		),
		makeCardDeck("Alice",
			[]types.Game{{Opponent: "Bob", Winner: "Alice"}},
			[]types.Card{{Name: "Lightning Bolt"}},
			nil,
		),
	}

	players := map[string]int{"Alice": 2}
	result := ExpectedWinPercent("Lightning Bolt", players, decks)
	assert.Equal(t, 0.0, result)
}

func TestExpectedWinPercent_WeightedNotAveraged(t *testing.T) {
	// Deck 1 (no card): 6 wins, 2 losses (8 games)
	// Deck 2 (no card): 1 win, 1 loss (2 games)
	// Weighted: (6+1)/(8+2) = 7/10 = 70%, NOT (75+50)/2 = 62.5%
	games1 := make([]types.Game, 0, 8)
	for i := 0; i < 6; i++ {
		games1 = append(games1, types.Game{Opponent: "Bob", Winner: "Alice"})
	}
	for i := 0; i < 2; i++ {
		games1 = append(games1, types.Game{Opponent: "Bob", Winner: "Bob"})
	}

	decks := []*storage.Deck{
		makeCardDeck("Alice", games1, []types.Card{{Name: "Counterspell"}}, nil),
		makeCardDeck("Alice",
			[]types.Game{
				{Opponent: "Bob", Winner: "Alice"},
				{Opponent: "Bob", Winner: "Bob"},
			},
			[]types.Card{{Name: "Mana Leak"}}, nil,
		),
	}

	players := map[string]int{"Alice": 1}
	result := ExpectedWinPercent("Lightning Bolt", players, decks)
	assert.InDelta(t, 70.0, result, 0.5)
}

// --- ELOData ---

func TestELOData_Empty(t *testing.T) {
	result := ELOData(nil)
	assert.Empty(t, result)
}

func TestELOData_MainboardGainsELO(t *testing.T) {
	// A card that is consistently mainboarded over a sideboarded card should gain ELO.
	decks := make([]*storage.Deck, 0, 10)
	for i := 0; i < 10; i++ {
		d := makeCardDeck("Alice", nil,
			[]types.Card{{Name: "Good Card", CMC: 3, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Creature"}}},
			[]types.Card{{Name: "Bad Card", CMC: 3, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Creature"}}},
		)
		d.Colors = []string{"R"}
		decks = append(decks, d)
	}

	result := ELOData(decks)
	assert.Greater(t, result["Good Card"], 1200)
	assert.Less(t, result["Bad Card"], 1200)
}
