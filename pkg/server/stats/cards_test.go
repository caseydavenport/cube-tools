package stats

import (
	"math"
	"math/rand"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func makeCardDeck(player string, games []types.Game, mainboard []types.Card, sideboard []types.Card) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Mainboard = mainboard
	d.Sideboard = sideboard
	foldGamesIntoMatches(d, player, games)
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

// makeELODecks builds n decks by rotating 5 cards through mainboard and
// sideboard slots, so each card sees many opponents and deck order matters.
func makeELODecks(n int) []*storage.Deck {
	cards := []types.Card{
		{Name: "Card-1", CMC: 1, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Creature"}},
		{Name: "Card-2", CMC: 2, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Creature"}},
		{Name: "Card-3", CMC: 3, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Instant"}},
		{Name: "Card-4", CMC: 4, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Creature"}},
		{Name: "Card-5", CMC: 5, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Sorcery"}},
	}
	decks := make([]*storage.Deck, 0, n)
	for i := 0; i < n; i++ {
		mb := []types.Card{cards[i%5], cards[(i+1)%5], cards[(i+2)%5]}
		sb := []types.Card{cards[(i+3)%5], cards[(i+4)%5]}
		d := makeCardDeck("Alice", nil, mb, sb)
		d.Colors = []string{"R"}
		decks = append(decks, d)
	}
	return decks
}

func TestELOData_InitsAt1200(t *testing.T) {
	decks := []*storage.Deck{
		makeCardDeck("Alice", nil,
			[]types.Card{{Name: "MB-Only", CMC: 1, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Instant"}}},
			nil,
		),
	}
	decks[0].Colors = []string{"R"}
	result := ELOData(decks)

	// With no sideboard to pair against, MB-Only never updates and stays at 1200.
	assert.Equal(t, 1200, result["MB-Only"])
	_, exists := result["Never Drafted"]
	assert.False(t, exists)
}

func TestELOData_BasicLandsSkipped(t *testing.T) {
	decks := []*storage.Deck{
		makeCardDeck("Alice", nil,
			[]types.Card{{Name: "Plains", Types: []string{"Basic", "Land"}, Colors: []string{"W"}, ColorIdentity: []string{"W"}}},
			[]types.Card{{Name: "Sideboard Spell", CMC: 2, Colors: []string{"W"}, ColorIdentity: []string{"W"}, Types: []string{"Instant"}}},
		),
	}
	decks[0].Colors = []string{"W"}
	result := ELOData(decks)
	assert.Equal(t, 1200, result["Plains"])
	assert.Equal(t, 1200, result["Sideboard Spell"])
}

func TestELOData_UncastableSideboardSkipped(t *testing.T) {
	decks := []*storage.Deck{
		makeCardDeck("Alice", nil,
			[]types.Card{{Name: "Red Spell", CMC: 2, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Instant"}}},
			[]types.Card{{Name: "Black Spell", CMC: 2, Colors: []string{"B"}, ColorIdentity: []string{"B"}, Types: []string{"Instant"}}},
		),
	}
	decks[0].Colors = []string{"R"}
	result := ELOData(decks)
	assert.Equal(t, 1200, result["Red Spell"])
	assert.Equal(t, 1200, result["Black Spell"])
}

// Updates should be approximately zero-sum across all participating cards.
// The only source of drift is int() truncation of the final float ELO per
// card, which is bounded by the number of cards.
func TestELOData_ApproximatelyZeroSum(t *testing.T) {
	decks := makeELODecks(20)
	result := ELOData(decks)

	total := 0
	for _, e := range result {
		total += e
	}
	expected := 1200 * len(result)
	delta := int(math.Abs(float64(total - expected)))
	assert.LessOrEqual(t, delta, len(result),
		"sum of ELO drifts from N*1200 by %d (decks=%d, cards=%d)", delta, len(decks), len(result))
}

func TestELOData_OrderIndependent(t *testing.T) {
	base := makeELODecks(30)
	a := append([]*storage.Deck(nil), base...)
	b := append([]*storage.Deck(nil), base...)
	r := rand.New(rand.NewSource(42))
	r.Shuffle(len(b), func(i, j int) { b[i], b[j] = b[j], b[i] })

	ra := ELOData(a)
	rb := ELOData(b)

	maxDiff := 0
	worstCard := ""
	for name, va := range ra {
		vb := rb[name]
		d := int(math.Abs(float64(va - vb)))
		if d > maxDiff {
			maxDiff = d
			worstCard = name
		}
	}
	assert.LessOrEqual(t, maxDiff, 2,
		"deck order changed %s's ELO by %d points", worstCard, maxDiff)
}
