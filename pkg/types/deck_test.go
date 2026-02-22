package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func intPtr(i int) *int {
	return &i
}

func makeDeck(player string, games []Game, matches []Match) *Deck {
	d := NewDeck()
	d.Player = player
	d.Games = games
	d.Matches = matches
	return d
}

// --- Game wins ---

func TestGameWins(t *testing.T) {
	d := makeDeck("Alice", []Game{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Bob", Winner: "Bob"},
		{Opponent: "Charlie", Winner: "Alice"},
	}, nil)
	assert.Equal(t, 2, d.GameWins())
}

func TestGameWins_Override(t *testing.T) {
	d := makeDeck("Alice", []Game{
		{Opponent: "Bob", Winner: "Alice"},
	}, nil)
	d.Wins = intPtr(5)
	assert.Equal(t, 5, d.GameWins())
}

func TestGameWins_NoGames(t *testing.T) {
	d := makeDeck("Alice", nil, nil)
	assert.Equal(t, 0, d.GameWins())
}

// --- Game losses ---

func TestGameLosses(t *testing.T) {
	d := makeDeck("Alice", []Game{
		{Opponent: "Bob", Winner: "Bob"},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Charlie"},
	}, nil)
	assert.Equal(t, 2, d.GameLosses())
}

func TestGameLosses_DrawsNotCounted(t *testing.T) {
	// Regression: draws (Winner="" or Tie=true) must NOT count as losses.
	d := makeDeck("Alice", []Game{
		{Opponent: "Bob", Winner: ""},           // draw via empty winner
		{Opponent: "Bob", Winner: "", Tie: true}, // draw via Tie flag
		{Opponent: "Bob", Winner: "Bob"},         // real loss
	}, nil)
	assert.Equal(t, 1, d.GameLosses())
}

func TestGameLosses_Override(t *testing.T) {
	d := makeDeck("Alice", []Game{
		{Opponent: "Bob", Winner: "Bob"},
	}, nil)
	d.Losses = intPtr(3)
	assert.Equal(t, 3, d.GameLosses())
}

// --- Game draws ---

func TestGameDraws(t *testing.T) {
	d := makeDeck("Alice", []Game{
		{Opponent: "Bob", Winner: ""},            // draw (empty winner)
		{Opponent: "Bob", Winner: "", Tie: true},  // draw (Tie flag)
		{Opponent: "Bob", Winner: "Bob"},          // loss, not a draw
		{Opponent: "Charlie", Winner: "Alice"},    // win, not a draw
	}, nil)
	assert.Equal(t, 2, d.GameDraws())
}

// --- Match wins ---

func TestMatchWins(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Charlie"},
		{Opponent: "Dave", Winner: "Alice"},
	})
	assert.Equal(t, 2, d.MatchWins())
}

func TestMatchWins_Override(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
	})
	d.MatchWinsOverride = intPtr(7)
	assert.Equal(t, 7, d.MatchWins())
}

// --- Match losses ---

func TestMatchLosses(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Bob"},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Dave", Winner: ""},  // draw, not a loss
	})
	assert.Equal(t, 1, d.MatchLosses())
}

func TestMatchLosses_Override(t *testing.T) {
	d := makeDeck("Alice", nil, nil)
	d.MatchLossesOverride = intPtr(2)
	assert.Equal(t, 2, d.MatchLosses())
}

// --- Match draws ---

func TestMatchDraws(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: ""},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Dave", Winner: ""},
	})
	assert.Equal(t, 2, d.MatchDraws())
}

func TestMatchDraws_Override(t *testing.T) {
	d := makeDeck("Alice", nil, nil)
	d.MatchDrawsOverride = intPtr(1)
	assert.Equal(t, 1, d.MatchDraws())
}

// --- Trophies ---

func TestTrophies(t *testing.T) {
	// 3-0 = trophy
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Dave", Winner: "Alice"},
	})
	assert.Equal(t, 1, d.Trophies())
}

func TestTrophies_DrawDoesNotPrevent(t *testing.T) {
	// 3-0-1 should still be a trophy (draws don't count as losses)
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Dave", Winner: "Alice"},
		{Opponent: "Eve", Winner: ""},
	})
	assert.Equal(t, 1, d.Trophies())
}

func TestTrophies_NotEnoughWins(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Alice"},
	})
	assert.Equal(t, 0, d.Trophies())
}

func TestTrophies_HasLoss(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Dave", Winner: "Alice"},
		{Opponent: "Eve", Winner: "Eve"},
	})
	assert.Equal(t, 0, d.Trophies())
}

// --- Last place ---

func TestLastPlace(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Bob"},
		{Opponent: "Charlie", Winner: "Charlie"},
		{Opponent: "Dave", Winner: "Dave"},
	})
	assert.Equal(t, 1, d.LastPlace())
}

func TestLastPlace_NotEnoughLosses(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Bob"},
		{Opponent: "Charlie", Winner: "Charlie"},
	})
	assert.Equal(t, 0, d.LastPlace())
}

func TestLastPlace_HasWin(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Bob"},
		{Opponent: "Charlie", Winner: "Charlie"},
		{Opponent: "Dave", Winner: "Dave"},
		{Opponent: "Eve", Winner: "Alice"},
	})
	assert.Equal(t, 0, d.LastPlace())
}

// --- TopHalf / BottomHalf ---

func TestTopHalf(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Dave", Winner: "Dave"},
	})
	assert.Equal(t, 1, d.TopHalf())
}

func TestTopHalf_Tied(t *testing.T) {
	// Tied (1-1) should NOT be top half
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Charlie"},
	})
	assert.Equal(t, 0, d.TopHalf())
}

func TestTopHalf_NoData(t *testing.T) {
	d := makeDeck("Alice", nil, nil)
	assert.Equal(t, 0, d.TopHalf())
}

func TestBottomHalf(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Bob"},
		{Opponent: "Charlie", Winner: "Bob"}, // Bob is not Alice, so this is a loss for Alice
		{Opponent: "Dave", Winner: "Alice"},
	})
	// 1 win, 2 losses → bottom half
	assert.Equal(t, 1, d.BottomHalf())
}

func TestBottomHalf_Tied(t *testing.T) {
	// Regression: tied record (1-1) should NOT be bottom half
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Charlie"},
	})
	assert.Equal(t, 0, d.BottomHalf())
}

func TestBottomHalf_NoData(t *testing.T) {
	d := makeDeck("Alice", nil, nil)
	assert.Equal(t, 0, d.BottomHalf())
}

// --- Macro ---

func TestMacro(t *testing.T) {
	tests := []struct {
		name   string
		labels []string
		want   string
	}{
		{"aggro", []string{"RDW", "aggro"}, "aggro"},
		{"midrange", []string{"Midrange", "value"}, "midrange"},
		{"control", []string{"draw-go", "Control"}, "control"},
		{"tempo", []string{"Tempo", "flash"}, "tempo"},
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

// --- GetColors ---

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

// --- ColorIdentities ---

func TestColorIdentities_TwoColor(t *testing.T) {
	d := NewDeck()
	d.Colors = []string{"W", "U"}
	ids := d.ColorIdentities()
	assert.True(t, ids["W"])
	assert.True(t, ids["U"])
	assert.True(t, ids["WU"])
	assert.False(t, ids["B"])
}

func TestColorIdentities_ThreeColor(t *testing.T) {
	d := NewDeck()
	d.Colors = []string{"W", "U", "G"}
	ids := d.ColorIdentities()
	assert.True(t, ids["W"])
	assert.True(t, ids["U"])
	assert.True(t, ids["G"])
	assert.True(t, ids["WU"])
	assert.True(t, ids["WG"])
	assert.True(t, ids["UG"])
	assert.True(t, ids["WUG"])
}

// --- CanCast ---

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

// --- PickCount ---

func TestPickCount_MainboardAndSideboard(t *testing.T) {
	d := NewDeck()
	d.Mainboard = []Card{
		{Name: "Lightning Bolt"},
		{Name: "Counterspell"},
		{Name: "Plains", Types: []string{"Basic", "Land"}}, // basic land, not counted
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
		{Name: "Plains", Types: []string{"Basic", "Land"}}, // basic lands ARE counted for pool
	}
	assert.Equal(t, 3, d.PickCount())
}

func TestPickCount_Empty(t *testing.T) {
	d := NewDeck()
	assert.Equal(t, 0, d.PickCount())
}

// --- AllCards ---

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

// --- AddMatch / AddGame ---

func TestAddMatch_SortsByOpponent(t *testing.T) {
	d := NewDeck()
	d.Player = "Alice"
	d.AddMatch("Charlie", "Alice")
	d.AddMatch("Alice_clone", "Alice_clone")
	d.AddMatch("Bob", "Alice")

	assert.Equal(t, 3, len(d.Matches))
	assert.Equal(t, "Alice_clone", d.Matches[0].Opponent)
	assert.Equal(t, "Bob", d.Matches[1].Opponent)
	assert.Equal(t, "Charlie", d.Matches[2].Opponent)
}

func TestAddGame_SortsByOpponent(t *testing.T) {
	d := NewDeck()
	d.Player = "Alice"
	d.AddGame("Charlie", "Alice")
	d.AddGame("Bob", "Bob")
	assert.Equal(t, "Bob", d.Games[0].Opponent)
	assert.Equal(t, "Charlie", d.Games[1].Opponent)
}

func TestAddGame_DrawSetsTieFlag(t *testing.T) {
	d := NewDeck()
	d.Player = "Alice"
	d.AddGame("Bob", "")
	assert.True(t, d.Games[0].Tie)
	assert.Equal(t, "", d.Games[0].Winner)
}

// --- RemoveMatchesForOpponent ---

func TestRemoveMatchesForOpponent(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Charlie"},
		{Opponent: "Bob", Winner: "Bob"},
	})
	d.RemoveMatchesForOpponent("Bob")
	assert.Equal(t, 1, len(d.Matches))
	assert.Equal(t, "Charlie", d.Matches[0].Opponent)
}

func TestRemoveMatchesForOpponent_NoneFound(t *testing.T) {
	d := makeDeck("Alice", nil, []Match{
		{Opponent: "Bob", Winner: "Alice"},
	})
	d.RemoveMatchesForOpponent("Charlie")
	assert.Equal(t, 1, len(d.Matches))
}

// --- GamesForOpponent ---

func TestGamesForOpponent(t *testing.T) {
	d := makeDeck("Alice", []Game{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Charlie"},
		{Opponent: "Bob", Winner: "Bob"},
	}, nil)
	games := d.GamesForOpponent("Bob")
	assert.Equal(t, 2, len(games))
}

func TestGamesForOpponent_NoneFound(t *testing.T) {
	d := makeDeck("Alice", []Game{
		{Opponent: "Bob", Winner: "Alice"},
	}, nil)
	games := d.GamesForOpponent("Charlie")
	assert.Equal(t, 0, len(games))
}

// --- RemoveGamesForOpponent ---

func TestRemoveGamesForOpponent(t *testing.T) {
	d := makeDeck("Alice", []Game{
		{Opponent: "Bob", Winner: "Alice"},
		{Opponent: "Charlie", Winner: "Alice"},
		{Opponent: "Bob", Winner: "Bob"},
	}, nil)
	d.RemoveGamesForOpponent("Bob")
	assert.Equal(t, 1, len(d.Games))
	assert.Equal(t, "Charlie", d.Games[0].Opponent)
}

// --- Game.Result ---

func TestGameResult(t *testing.T) {
	tests := []struct {
		name string
		game Game
		want Result
	}{
		{"win", Game{Opponent: "Bob", Winner: "Alice"}, ResultWin},
		{"loss", Game{Opponent: "Bob", Winner: "Bob"}, ResultLoss},
		{"draw empty winner", Game{Opponent: "Bob", Winner: ""}, ResultDraw},
		{"draw tie flag", Game{Opponent: "Bob", Winner: "", Tie: true}, ResultDraw},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.game.Result())
		})
	}
}
