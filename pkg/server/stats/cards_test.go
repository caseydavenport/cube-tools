package stats

import (
	"encoding/json"
	"math"
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func makeCardDeck(player string, games []types.Game, mainboard []types.Card, sideboard []types.Card) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Mainboard = mainboard
	d.Sideboard = sideboard
	foldGamesIntoMatches(d, player, games)
	return d
}

func TestPickELOData_Empty(t *testing.T) {
	result := PickELOData(nil)
	assert.Empty(t, result)
}

func TestPickELOData_MainboardGainsELO(t *testing.T) {
	// A card that is consistently mainboarded over a sideboarded card should gain ELO.
	decks := make([]*storage.Deck, 0, 10)
	for i := 0; i < 10; i++ {
		d := makeCardDeck(
			"Freddie",
			nil,
			[]types.Card{{Name: "Good Card", CMC: 3, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Creature"}}},
			[]types.Card{{Name: "Bad Card", CMC: 3, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Creature"}}},
		)
		d.Colors = []string{"R"}
		decks = append(decks, d)
	}

	result := PickELOData(decks)
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
		d := makeCardDeck("Freddie", nil, mb, sb)
		d.Colors = []string{"R"}
		decks = append(decks, d)
	}
	return decks
}

func TestPickELOData_InitsAt1200(t *testing.T) {
	decks := []*storage.Deck{
		makeCardDeck("Freddie", nil, []types.Card{{Name: "MB-Only", CMC: 1, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Instant"}}}, nil),
	}
	decks[0].Colors = []string{"R"}
	result := PickELOData(decks)

	// With no sideboard to pair against, MB-Only never updates and stays at 1200.
	assert.Equal(t, 1200, result["MB-Only"])
	_, exists := result["Never Drafted"]
	assert.False(t, exists)
}

func TestPickELOData_BasicLandsSkipped(t *testing.T) {
	decks := []*storage.Deck{
		makeCardDeck(
			"Freddie",
			nil,
			[]types.Card{{Name: "Plains", Types: []string{"Basic", "Land"}, Colors: []string{"W"}, ColorIdentity: []string{"W"}}},
			[]types.Card{{Name: "Sideboard Spell", CMC: 2, Colors: []string{"W"}, ColorIdentity: []string{"W"}, Types: []string{"Instant"}}},
		),
	}
	decks[0].Colors = []string{"W"}
	result := PickELOData(decks)
	assert.Equal(t, 1200, result["Plains"])
	assert.Equal(t, 1200, result["Sideboard Spell"])
}

func TestPickELOData_UncastableSideboardSkipped(t *testing.T) {
	decks := []*storage.Deck{
		makeCardDeck(
			"Freddie",
			nil,
			[]types.Card{{Name: "Red Spell", CMC: 2, Colors: []string{"R"}, ColorIdentity: []string{"R"}, Types: []string{"Instant"}}},
			[]types.Card{{Name: "Black Spell", CMC: 2, Colors: []string{"B"}, ColorIdentity: []string{"B"}, Types: []string{"Instant"}}},
		),
	}
	decks[0].Colors = []string{"R"}
	result := PickELOData(decks)
	assert.Equal(t, 1200, result["Red Spell"])
	assert.Equal(t, 1200, result["Black Spell"])
}

// Updates should be approximately zero-sum across all participating cards.
// The only source of drift is int() truncation of the final float ELO per
// card, which is bounded by the number of cards.
func TestPickELOData_ApproximatelyZeroSum(t *testing.T) {
	decks := makeELODecks(20)
	result := PickELOData(decks)

	total := 0
	for _, e := range result {
		total += e
	}
	expected := 1200 * len(result)
	delta := int(math.Abs(float64(total - expected)))
	assert.LessOrEqual(t, delta, len(result), "sum of ELO drifts from N*1200 by %d (decks=%d, cards=%d)", delta, len(decks), len(result))
}

func TestPickELOData_OrderIndependent(t *testing.T) {
	base := makeELODecks(30)
	a := append([]*storage.Deck(nil), base...)
	b := append([]*storage.Deck(nil), base...)
	r := rand.New(rand.NewSource(42))
	r.Shuffle(len(b), func(i, j int) { b[i], b[j] = b[j], b[i] })

	ra := PickELOData(a)
	rb := PickELOData(b)

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
	assert.LessOrEqual(t, maxDiff, 2, "deck order changed %s's ELO by %d points", worstCard, maxDiff)
}

type colorsCompeteCase struct {
	name string
	a    []string
	b    []string
	want bool
}

func TestColorsCompete(t *testing.T) {
	tests := []colorsCompeteCase{
		{"both colorless", nil, nil, true},
		{"colorless empty slices", []string{}, []string{}, true},
		{"colorless vs mono", []string{}, []string{"W"}, true},
		{"mono vs colorless", []string{"W"}, []string{}, true},
		{"colorless vs multi", nil, []string{"W", "U", "B"}, true},

		{"same mono", []string{"W"}, []string{"W"}, true},
		{"different mono", []string{"W"}, []string{"U"}, false},

		{"mono vs dual sharing color", []string{"W"}, []string{"W", "U"}, true},
		{"dual vs mono sharing color", []string{"W", "U"}, []string{"W"}, true},
		{"mono vs dual not sharing", []string{"R"}, []string{"W", "U"}, false},

		{"dual vs dual sharing one", []string{"W", "U"}, []string{"U", "B"}, true},
		{"dual vs dual disjoint", []string{"W", "U"}, []string{"B", "R"}, false},
		{"dual vs dual identical", []string{"W", "U"}, []string{"W", "U"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, colorsCompete(tt.a, tt.b))

			// Symmetric: order shouldn't matter.
			assert.Equal(t, tt.want, colorsCompete(tt.b, tt.a), "colorsCompete should be symmetric")
		})
	}
}

func TestEloWinValue_ColorPenalty(t *testing.T) {
	// Same CMC and type, only color identity varies. The penalty for
	// non-matching colors is 0.05, so cards that share a color (or include
	// a colorless side) should score 0.05 higher than disjoint pairs.
	base := types.Card{CMC: 2, Types: []string{"Creature"}, Colors: []string{"W"}}

	sameColor := types.Card{CMC: 2, Types: []string{"Creature"}, Colors: []string{"W"}}
	monoVsDualShared := types.Card{CMC: 2, Types: []string{"Creature"}, Colors: []string{"W", "U"}}
	monoVsDualDisjoint := types.Card{CMC: 2, Types: []string{"Creature"}, Colors: []string{"U", "B"}}
	colorless := types.Card{CMC: 2, Types: []string{"Creature"}, Colors: []string{}}

	assert.InDelta(t, eloWinValue(base, sameColor), eloWinValue(base, monoVsDualShared), 1e-9, "W vs WU should match (share W)")
	assert.InDelta(t, eloWinValue(base, sameColor), eloWinValue(base, colorless), 1e-9, "colorless competes with anything")
	assert.Greater(t, eloWinValue(base, sameColor), eloWinValue(base, monoVsDualDisjoint), "disjoint colors should drop winValue")
}

func TestCardPlayersCountsSeatsSeparately(t *testing.T) {
	seat := func(draft int) *storage.Deck {
		d := makeStorageDeck("p3", draft, nil, nil, nil)
		d.ID = 3
		d.Date = "2024-01-01"
		d.Mainboard = []types.Card{{Name: "Lightning Bolt"}}
		return d
	}
	cube := map[string]types.Card{"Lightning Bolt": {Name: "Lightning Bolt"}}
	got := statsForDecks([]*storage.Deck{seat(1), seat(2)}, cube, &CardStatsRequest{DecksRequest: &storage.DecksRequest{}})
	bolt := got.Data["Lightning Bolt"]
	if assert.NotNil(t, bolt) {
		assert.Len(t, bolt.Players, 2)
	}
}

func TestCardStats_CountsDecksByMacro(t *testing.T) {
	deck := func(id int, macro string, labels ...string) *storage.Deck {
		d := makeStorageDeck("Freddie", 1, nil, nil, nil)
		d.ID = id
		d.Date = "2024-01-01"
		d.MacroArchetype = macro
		d.Labels = labels
		d.Mainboard = []types.Card{{Name: "Lightning Bolt"}}
		return d
	}
	decks := []*storage.Deck{
		deck(1, "aggro"),
		deck(2, "Aggro"),
		deck(3, "", "control"),
		deck(4, "", "burn"),
	}
	cube := map[string]types.Card{"Lightning Bolt": {Name: "Lightning Bolt"}}

	got := statsForDecks(decks, cube, &CardStatsRequest{DecksRequest: &storage.DecksRequest{}})
	bolt := got.Data["Lightning Bolt"]
	if assert.NotNil(t, bolt) {
		// A macro is read case-insensitively, or from a tag on older decks; a
		// deck with neither is left out.
		numWantByMacro := map[string]int{
			"aggro":   2,
			"control": 1,
		}
		assert.Equal(t, numWantByMacro, bolt.NumDecksByMacro)
		assert.Equal(t, 4, bolt.Mainboard)
	}
}

func TestCardStats_CarriesOracleTags(t *testing.T) {
	stats := newCardStats(types.Card{Name: "Lightning Bolt", OracleTags: []string{"burn", "removal"}})
	b, err := json.Marshal(stats)
	assert.NoError(t, err)
	assert.Contains(t, string(b), `"oracle_tags":["burn","removal"]`)

	b, err = json.Marshal(types.Card{Name: "Lightning Bolt", OracleTags: []string{"burn"}})
	assert.NoError(t, err)
	assert.NotContains(t, string(b), "oracle_tags", "deck cards keep their full tags off the wire")
}

func TestShouldFilterCard(t *testing.T) {
	card := &cardStats{Drafts: 2, Wins: 1, Losses: 1}

	assert.False(t, shouldFilterCard(card, &CardStatsRequest{}), "no minimums keeps everything")
	assert.True(t, shouldFilterCard(card, &CardStatsRequest{MinDrafts: 3}))
	assert.False(t, shouldFilterCard(card, &CardStatsRequest{MinDrafts: 2}))
	assert.True(t, shouldFilterCard(card, &CardStatsRequest{MinGames: 3}))
	assert.False(t, shouldFilterCard(card, &CardStatsRequest{MinGames: 2}))
	assert.False(t, shouldFilterCard(card, &CardStatsRequest{MinDrafts: 3, MinGames: 3, BucketSize: 7}), "buckets are never filtered")
}

func TestCardSetFromDeck_SkipsCardsThatDontCount(t *testing.T) {
	bolt := types.Card{Name: "Lightning Bolt", Types: []string{"Instant"}, Colors: []string{"R"}, ColorIdentity: []string{"R"}}
	plains := types.Card{Name: "Plains", Types: []string{"Basic", "Land"}}
	counterspell := types.Card{Name: "Counterspell", Types: []string{"Instant"}, Colors: []string{"U"}, ColorIdentity: []string{"U"}}
	cube := map[string]types.Card{
		bolt.Name:         bolt,
		plains.Name:       plains,
		counterspell.Name: counterspell,
	}
	cutCard := types.Card{Name: "Cut Card", Types: []string{"Instant"}, Colors: []string{"R"}}

	deck := types.Deck{
		Mainboard: []types.Card{bolt, bolt, plains, cutCard, counterspell},
		Sideboard: []types.Card{counterspell},
	}
	mb, sb, pool := cardSetFromDeck(deck, cube, "R")

	assert.Len(t, mb, 1, "two bolts count once; basics, cut cards and off-color cards are skipped")
	assert.Contains(t, mb, "Lightning Bolt")
	assert.Empty(t, sb, "an off-color sideboard card is skipped by the color filter")
	assert.Empty(t, pool)
}

func TestCardSetFromDeck_PoolSplitsByCastability(t *testing.T) {
	bolt := types.Card{Name: "Lightning Bolt", Types: []string{"Instant"}, Colors: []string{"R"}, ColorIdentity: []string{"R"}}
	counterspell := types.Card{Name: "Counterspell", Types: []string{"Instant"}, Colors: []string{"U"}, ColorIdentity: []string{"U"}}
	cube := map[string]types.Card{
		bolt.Name:         bolt,
		counterspell.Name: counterspell,
	}

	deck := types.Deck{Pool: []types.Card{bolt, counterspell}}
	deck.Colors = []string{"R"}
	mb, sb, pool := cardSetFromDeck(deck, cube, "")

	assert.Empty(t, mb)
	assert.Contains(t, pool, "Lightning Bolt", "a castable pool card stays in the pool")
	assert.Contains(t, sb, "Counterspell", "a pool card outside the deck's colors counts as sideboarded")

	deck.Colors = nil
	_, sb, pool = cardSetFromDeck(deck, cube, "")
	assert.Empty(t, sb, "a pool with no color identity can't tell what was sideboarded")
	assert.Len(t, pool, 2)
}
