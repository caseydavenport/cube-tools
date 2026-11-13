package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// makeDeck builds a Deck where each Game is folded into a Match keyed by
// opponent. Wins/Losses/Draws are tallied from the games so the Game* and
// Match* helpers see consistent data. If both games and matches are passed,
// games attach to the matching opponent (or create a new match).
func makeDeck(player string, games []Game, matches []Match) *Deck {
	deck := NewDeck()
	deck.Player = player
	deck.Matches = matches
	for _, g := range games {
		idx := -1
		for i := range deck.Matches {
			if deck.Matches[i].Opponent == g.Opponent {
				idx = i
				break
			}
		}
		if idx == -1 {
			deck.Matches = append(deck.Matches, Match{Opponent: g.Opponent})
			idx = len(deck.Matches) - 1
		}
		deck.Matches[idx].Games = append(deck.Matches[idx].Games, g)
		switch {
		case g.Winner == player:
			deck.Matches[idx].Wins++
		case g.Winner == "" || g.Tie:
			deck.Matches[idx].Draws++
		default:
			deck.Matches[idx].Losses++
		}
	}
	return deck
}

func TestGameWins(t *testing.T) {
	d := makeDeck("Freddie", []Game{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Ozzy", Winner: "Ozzy"},
		{Opponent: "Stevie", Winner: "Freddie"},
	}, nil)
	assert.Equal(t, 2, d.GameWins())
}

func TestGameWins_NoGames(t *testing.T) {
	d := makeDeck("Freddie", nil, nil)
	assert.Equal(t, 0, d.GameWins())
}

func TestGameLosses(t *testing.T) {
	d := makeDeck("Freddie", []Game{
		{Opponent: "Ozzy", Winner: "Ozzy"},
		{Opponent: "Stevie", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Stevie"},
	}, nil)
	assert.Equal(t, 2, d.GameLosses())
}

func TestGameLosses_DrawsNotCounted(t *testing.T) {
	// Regression: draws (Winner="" or Tie=true) must NOT count as losses.
	d := makeDeck("Freddie", []Game{
		// Draw via empty winner.
		{Opponent: "Ozzy", Winner: ""},

		// Draw via Tie flag.
		{Opponent: "Ozzy", Winner: "", Tie: true},

		// Real loss.
		{Opponent: "Ozzy", Winner: "Ozzy"},
	}, nil)
	assert.Equal(t, 1, d.GameLosses())
}

func TestGameDraws(t *testing.T) {
	d := makeDeck("Freddie", []Game{
		// Draw (empty winner).
		{Opponent: "Ozzy", Winner: ""},

		// Draw (Tie flag).
		{Opponent: "Ozzy", Winner: "", Tie: true},

		// Loss, not a draw.
		{Opponent: "Ozzy", Winner: "Ozzy"},

		// Win, not a draw.
		{Opponent: "Stevie", Winner: "Freddie"},
	}, nil)
	assert.Equal(t, 2, d.GameDraws())
}

func TestMatchWins(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Stevie"},
		{Opponent: "Joan", Winner: "Freddie"},
	})
	assert.Equal(t, 2, d.MatchWins())
}

func TestMatchLosses(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Ozzy"},
		{Opponent: "Stevie", Winner: "Freddie"},

		// Draw, not a loss.
		{Opponent: "Joan", Winner: ""},
	})
	assert.Equal(t, 1, d.MatchLosses())
}

func TestMatchDraws(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: ""},
		{Opponent: "Stevie", Winner: "Freddie"},
		{Opponent: "Joan", Winner: ""},
	})
	assert.Equal(t, 2, d.MatchDraws())
}

// An empty stub match (no Opponent, no Games, no game counts) is not a
// real result and must not count as a draw. The legacy file loader used
// to synthesize one of these when only deck-level wins/losses existed.
func TestMatchDraws_IgnoresEmptyStub(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{{}})
	assert.Equal(t, 0, d.MatchDraws())
	assert.Equal(t, 0, d.MatchWins())
	assert.Equal(t, 0, d.MatchLosses())
}

// A legacy-style match with explicit game counts that happen to be equal
// (e.g., 1-1) is a real draw and should still count.
func TestMatchDraws_GameCountsEqualCountsAsDraw(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Wins: 1, Losses: 1},
	})
	assert.Equal(t, 1, d.MatchDraws())
}

func TestTrophies(t *testing.T) {
	// 3-0 = trophy
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Freddie"},
		{Opponent: "Joan", Winner: "Freddie"},
	})
	assert.Equal(t, 1, d.Trophies())
}

func TestTrophies_DrawDisqualifies(t *testing.T) {
	// 3-0-1 is not a trophy: a trophy requires a perfect record.
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Freddie"},
		{Opponent: "Joan", Winner: "Freddie"},
		{Opponent: "Mick", Winner: "", Draws: 1},
	})
	assert.Equal(t, 0, d.Trophies())
}

func TestTrophies_LongerSwiss(t *testing.T) {
	// 4-0 in a 4-round event is also a trophy.
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Freddie"},
		{Opponent: "Joan", Winner: "Freddie"},
		{Opponent: "Mick", Winner: "Freddie"},
	})
	assert.Equal(t, 1, d.Trophies())
}

func TestTrophies_NotEnoughWins(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Freddie"},
	})
	assert.Equal(t, 0, d.Trophies())
}

func TestTrophies_HasLoss(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Freddie"},
		{Opponent: "Joan", Winner: "Freddie"},
		{Opponent: "Mick", Winner: "Mick"},
	})
	assert.Equal(t, 0, d.Trophies())
}

func TestLastPlace(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Ozzy"},
		{Opponent: "Stevie", Winner: "Stevie"},
		{Opponent: "Joan", Winner: "Joan"},
	})
	assert.Equal(t, 1, d.LastPlace())
}

func TestLastPlace_NotEnoughLosses(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Ozzy"},
		{Opponent: "Stevie", Winner: "Stevie"},
	})
	assert.Equal(t, 0, d.LastPlace())
}

func TestLastPlace_HasWin(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Ozzy"},
		{Opponent: "Stevie", Winner: "Stevie"},
		{Opponent: "Joan", Winner: "Joan"},
		{Opponent: "Mick", Winner: "Freddie"},
	})
	assert.Equal(t, 0, d.LastPlace())
}

func TestTopHalf(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Freddie"},
		{Opponent: "Joan", Winner: "Joan"},
	})
	assert.Equal(t, 1, d.TopHalf())
}

func TestTopHalf_Tied(t *testing.T) {
	// Tied (1-1) should NOT be top half
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Stevie"},
	})
	assert.Equal(t, 0, d.TopHalf())
}

func TestTopHalf_NoData(t *testing.T) {
	d := makeDeck("Freddie", nil, nil)
	assert.Equal(t, 0, d.TopHalf())
}

func TestBottomHalf(t *testing.T) {
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Ozzy"},

		// Ozzy is not Freddie, so this is a loss for Freddie.
		{Opponent: "Stevie", Winner: "Ozzy"},
		{Opponent: "Joan", Winner: "Freddie"},
	})

	// 1 win, 2 losses is the bottom half.
	assert.Equal(t, 1, d.BottomHalf())
}

func TestBottomHalf_Tied(t *testing.T) {
	// Regression: tied record (1-1) should NOT be bottom half
	d := makeDeck("Freddie", nil, []Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Stevie"},
	})
	assert.Equal(t, 0, d.BottomHalf())
}

func TestBottomHalf_NoData(t *testing.T) {
	d := makeDeck("Freddie", nil, nil)
	assert.Equal(t, 0, d.BottomHalf())
}

type macroTest struct {
	name   string
	labels []string
	want   string
}

func TestMacro(t *testing.T) {
	tests := []macroTest{
		{"aggro", []string{"RDW", "aggro"}, "aggro"},
		{"midrange", []string{"Midrange", "value"}, "midrange"},
		{"control", []string{"draw-go", "Control"}, "control"},
		{"tempo no longer a macro", []string{"Tempo", "flash"}, ""},
		{"no macro", []string{"reanimator", "graveyard"}, ""},
		{"empty", nil, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := NewDeck()
			d.Labels = tt.labels
			assert.Equal(t, tt.want, d.Macro())
		})
	}
}

func TestGetColors_ExplicitColors(t *testing.T) {
	d := NewDeck()
	d.Colors = []string{"W", "U"}
	colors := d.GetColors()
	assert.True(t, colors["W"])
	assert.True(t, colors["U"])
	assert.False(t, colors["B"])
}

func TestGetColors_InferredFromMainboard(t *testing.T) {
	d := NewDeck()
	d.Mainboard = []Card{
		{Name: "Lightning Bolt", Colors: []string{"R"}},
		{Name: "Counterspell", Colors: []string{"U"}},
	}
	colors := d.GetColors()
	assert.True(t, colors["R"])
	assert.True(t, colors["U"])
	assert.Equal(t, 2, len(colors))
}

func TestGetColors_SkipsHybrid(t *testing.T) {
	d := NewDeck()
	d.Mainboard = []Card{
		{Name: "Lightning Bolt", Colors: []string{"R"}},
		{Name: "Figure of Destiny", Colors: []string{"R", "W"}, ManaCost: "{R/W}"},
	}
	colors := d.GetColors()

	// Hybrid card should be skipped, so only R from Lightning Bolt
	assert.True(t, colors["R"])
	assert.Equal(t, 1, len(colors))
}

func TestCanCast_ColorlessCard(t *testing.T) {
	d := NewDeck()
	d.Colors = []string{"R"}
	c := Card{Name: "Sol Ring", Colors: nil, Types: []string{"Artifact"}}
	assert.True(t, d.CanCast(c))
}

func TestCanCast_InColor(t *testing.T) {
	d := NewDeck()
	d.Colors = []string{"R", "U"}
	c := Card{Name: "Lightning Bolt", Colors: []string{"R"}, ColorIdentity: []string{"R"}}
	assert.True(t, d.CanCast(c))
}

func TestCanCast_OutOfColor(t *testing.T) {
	d := NewDeck()
	d.Colors = []string{"R"}
	c := Card{Name: "Counterspell", Colors: []string{"U"}, ColorIdentity: []string{"U"}}
	assert.False(t, d.CanCast(c))
}

func TestCanCast_Land(t *testing.T) {
	d := NewDeck()
	d.Colors = []string{"R", "W"}

	// Lands have no colors, uses color identity instead
	c := Card{Name: "Sacred Foundry", Types: []string{"Land"}, Colors: nil, ColorIdentity: []string{"R", "W"}}
	assert.True(t, d.CanCast(c))
}

func TestCanCast_LandOutOfColor(t *testing.T) {
	d := NewDeck()
	d.Colors = []string{"R"}
	c := Card{Name: "Hallowed Fountain", Types: []string{"Land"}, Colors: nil, ColorIdentity: []string{"W", "U"}}
	assert.False(t, d.CanCast(c))
}

func TestPickCount_MainboardAndSideboard(t *testing.T) {
	d := NewDeck()
	d.Mainboard = []Card{
		{Name: "Lightning Bolt"},
		{Name: "Counterspell"},

		// A basic land isn't a pick, so it isn't counted.
		{Name: "Plains", Types: []string{"Basic", "Land"}},
	}
	d.Sideboard = []Card{
		{Name: "Negate"},
	}
	assert.Equal(t, 3, d.PickCount())
}

func TestPickCount_Pool(t *testing.T) {
	d := NewDeck()
	d.Pool = []Card{
		{Name: "Lightning Bolt"},
		{Name: "Counterspell"},

		// A pool counts every card, basic lands included.
		{Name: "Plains", Types: []string{"Basic", "Land"}},
	}
	assert.Equal(t, 3, d.PickCount())
}

func TestPickCount_Empty(t *testing.T) {
	d := NewDeck()
	assert.Equal(t, 0, d.PickCount())
}

func TestAllCards(t *testing.T) {
	d := NewDeck()
	d.Mainboard = []Card{{Name: "Bolt"}, {Name: "Counter"}}
	d.Sideboard = []Card{{Name: "Negate"}}
	d.Pool = []Card{{Name: "Forest"}}
	assert.Equal(t, 4, len(d.AllCards()))
}

func TestAllCards_Empty(t *testing.T) {
	d := NewDeck()
	assert.Equal(t, 0, len(d.AllCards()))
}

// Build a non-land card with the given mana cost for tests below.
func ccard(manaCost string) Card {
	return Card{ManaCost: manaCost, Types: []string{"Creature"}}
}

func addN(d *Deck, n int, manaCost string) {
	for range n {
		d.Mainboard = append(d.Mainboard, ccard(manaCost))
	}
}

func TestPrimaryColorPair_ClearSplashCollapses(t *testing.T) {
	// W=10, U=10, R=2. R is under half of the weaker main (10/2 = 5), so it's a splash.
	d := &Deck{Colors: []string{"W", "U", "R"}}
	addN(d, 10, "{W}")
	addN(d, 10, "{U}")
	addN(d, 2, "{R}")
	assert.Equal(t, NewColorIdentity("W", "U"), d.PrimaryColorPair())
}

func TestPrimaryColorPair_BalancedThirdColorNotCollapsed(t *testing.T) {
	// W=10, U=10, R=8. R is above half the weaker main (5), so it's a real third color.
	d := &Deck{Colors: []string{"W", "U", "R"}}
	addN(d, 10, "{W}")
	addN(d, 10, "{U}")
	addN(d, 8, "{R}")
	assert.Nil(t, d.PrimaryColorPair())
}

func TestPrimaryColorPair_FiveColorEvenStays(t *testing.T) {
	// 5 pips of every color - none is under half of another, so nothing collapses.
	d := &Deck{Colors: []string{"W", "U", "B", "R", "G"}}
	addN(d, 5, "{W}")
	addN(d, 5, "{U}")
	addN(d, 5, "{B}")
	addN(d, 5, "{R}")
	addN(d, 5, "{G}")
	assert.Nil(t, d.PrimaryColorPair())
}

func TestPrimaryColorPair_HeavyPairSmallSplash(t *testing.T) {
	// W=15, U=15, B=5. B is under half the weaker main (7.5), so it's a splash.
	d := &Deck{Colors: []string{"W", "U", "B"}}
	addN(d, 15, "{W}")
	addN(d, 15, "{U}")
	addN(d, 5, "{B}")
	assert.Equal(t, NewColorIdentity("W", "U"), d.PrimaryColorPair())
}

func TestPrimaryColorPair_HybridCountsBothColors(t *testing.T) {
	// {W/U} pips push both W and U to 10, leaving R (2) as the only splash.
	d := &Deck{Colors: []string{"W", "U", "R"}}
	addN(d, 10, "{W/U}")
	addN(d, 2, "{R}")
	assert.Equal(t, NewColorIdentity("W", "U"), d.PrimaryColorPair())
}

func TestPrimaryColorPair_TwoColorIsItsOwnPair(t *testing.T) {
	d := &Deck{Colors: []string{"W", "U"}}
	addN(d, 10, "{W}")
	addN(d, 10, "{U}")
	assert.Equal(t, NewColorIdentity("W", "U"), d.PrimaryColorPair())
}

func TestPrimaryColorPair_MonoColorReturnsNil(t *testing.T) {
	d := &Deck{Colors: []string{"W"}}
	addN(d, 10, "{W}")
	assert.Nil(t, d.PrimaryColorPair())
}

func TestMatchResultsFromCounts(t *testing.T) {
	d := NewDeck()
	d.Matches = []Match{
		{OpponentID: 2, Wins: 2, Losses: 1},
		{OpponentID: 3, Wins: 1, Losses: 1, Draws: 1},
		{OpponentID: 4},
		{},
	}
	assert.Equal(t, 1, d.MatchWins())
	assert.Equal(t, 0, d.MatchLosses())
	assert.Equal(t, 2, d.MatchDraws())
}
