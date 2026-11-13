package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// makeStorageDeck builds a deck for player. Each game is folded into the
// match against its opponent, creating the match when the deck has none, and
// tallied into that match's wins, losses and draws.
func makeStorageDeck(player string, draftID int, date string, games []types.Game, matches []types.Match, labels []string) *Deck {
	deck := &Deck{}
	deck.Player = player
	deck.Metadata.DraftID = draftID
	deck.Date = date
	deck.Matches = matches
	deck.Labels = labels

	for _, g := range games {
		placed := false
		for i := range deck.Matches {
			if deck.Matches[i].Opponent == g.Opponent {
				deck.Matches[i].Games = append(deck.Matches[i].Games, g)
				switch {
				case g.Winner == player:
					deck.Matches[i].Wins++
				case g.Winner == "" || g.Tie:
					deck.Matches[i].Draws++
				default:
					deck.Matches[i].Losses++
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
			deck.Matches = append(deck.Matches, m)
		}
	}

	// Enrich rebuilds Games, but tests that skip it still read the flat list.
	deck.Games = make([]types.Game, 0)
	for _, m := range deck.Matches {
		deck.Games = append(deck.Games, m.Games...)
	}
	return deck
}

func TestEnrich_Stats(t *testing.T) {
	deck := makeStorageDeck(
		"Freddie",
		1,
		"2024-01-01",
		[]types.Game{
			{Opponent: "Joan", Winner: "Freddie"},
			{Opponent: "Joan", Winner: "Joan"},
			{Opponent: "Joan", Winner: "Freddie"},
		},
		[]types.Match{
			{Opponent: "Joan", Winner: "Freddie"},
		},
		nil,
	)

	Enrich([]*Deck{deck})

	assert.Equal(t, 2, deck.Stats.GameWins)
	assert.Equal(t, 1, deck.Stats.GameLosses)
	assert.Equal(t, 0, deck.Stats.GameDraws)
	assert.Equal(t, 1, deck.Stats.MatchWins)
	assert.Equal(t, 0, deck.Stats.MatchLosses)

	// One match win is short of the three a trophy takes.
	assert.Equal(t, 0, deck.Stats.Trophies)
}

// A match that recorded only aggregate Win/Loss/Draw counts (no per-game rows)
// still yields flattened games, so consumers that walk deck.Games count it.
func TestEnrich_SynthesizesGamesFromMatchCounts(t *testing.T) {
	deck := &Deck{}
	deck.Player = "Freddie"
	deck.Metadata.DraftID = 1
	deck.Matches = []types.Match{
		{Opponent: "Joan", Wins: 2, Losses: 1},
		{Opponent: "Stevie", Wins: 0, Losses: 1, Draws: 1},
	}

	Enrich([]*Deck{deck})

	// Two wins and a loss against Joan, a loss and a draw against Stevie.
	assert.Len(t, deck.Games, 5)
	wins, losses, draws := 0, 0, 0
	for _, g := range deck.Games {
		assert.Contains(t, []string{"Joan", "Stevie"}, g.Opponent)
		switch {
		case g.Tie:
			draws++
		case g.Winner == "Freddie":
			wins++
		default:
			losses++
			assert.Equal(t, g.Opponent, g.Winner)
		}
	}
	assert.Equal(t, 2, wins)
	assert.Equal(t, 2, losses)
	assert.Equal(t, 1, draws)
	assert.Equal(t, 2, deck.Stats.GameWins)
	assert.Equal(t, 2, deck.Stats.GameLosses)
	assert.Equal(t, 1, deck.Stats.GameDraws)
}

// A match with per-game rows keeps them as they are, ignoring the tallies, so
// the rows aren't counted twice.
func TestEnrich_KeepsRecordedGames(t *testing.T) {
	deck := &Deck{}
	deck.Player = "Freddie"
	deck.Matches = []types.Match{{
		Opponent: "Joan", Wins: 2,
		Games: []types.Game{{Opponent: "Joan", Winner: "Freddie", Won: true}},
	}}

	Enrich([]*Deck{deck})

	assert.Len(t, deck.Games, 1)
}

func TestEnrich_OpponentWinPercentage(t *testing.T) {
	// A three-deck draft where Freddie played Joan, and Joan also played Stevie.
	freddie := makeStorageDeck(
		"Freddie",
		1,
		"2024-01-01",
		[]types.Game{
			{Opponent: "Joan", Winner: "Freddie"},
			{Opponent: "Joan", Winner: "Freddie"},
		},
		[]types.Match{
			{Opponent: "Joan", Winner: "Freddie"},
		},
		nil,
	)

	joan := makeStorageDeck(
		"Joan",
		1,
		"2024-01-01",
		[]types.Game{
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Stevie", Winner: "Joan"},
			{Opponent: "Stevie", Winner: "Stevie"},
		},
		[]types.Match{
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Stevie", Winner: "Joan"},
		},
		nil,
	)

	stevie := makeStorageDeck(
		"Stevie",
		1,
		"2024-01-01",
		[]types.Game{
			{Opponent: "Joan", Winner: "Joan"},
			{Opponent: "Joan", Winner: "Stevie"},
		},
		[]types.Match{
			{Opponent: "Joan", Winner: "Joan"},
		},
		nil,
	)

	Enrich([]*Deck{freddie, joan, stevie})

	// Joan's games outside the ones against Freddie are one win and one loss
	// against Stevie, so Freddie's opponents win 50%.
	assert.InDelta(t, 50.0, freddie.OpponentWinPercentage, 0.5)
	assert.Equal(t, 1, freddie.RatedOpponents)
}

// In a two-player draft the opponent has no other games to rate them by, so
// the deck has no rated opponents and its 0% means unknown, not weak.
func TestEnrich_RatedOpponentsSkipsOpponentWithNoOtherGames(t *testing.T) {
	ozzy := makeStorageDeck("Ozzy", 1, "2024-01-01", []types.Game{{Opponent: "Stevie", Winner: "Ozzy"}}, []types.Match{{Opponent: "Stevie", Winner: "Ozzy"}}, nil)
	stevie := makeStorageDeck("Stevie", 1, "2024-01-01", []types.Game{{Opponent: "Ozzy", Winner: "Ozzy"}}, []types.Match{{Opponent: "Ozzy", Winner: "Ozzy"}}, nil)

	Enrich([]*Deck{ozzy, stevie})

	assert.Equal(t, 0, ozzy.RatedOpponents)
	assert.Equal(t, 0.0, ozzy.OpponentWinPercentage)
}

// Playing the same opponent twice (a round 1 match and a finals rematch)
// counts that opponent once in the average. Freddie's second opponent, Stevie,
// has a different record from Joan's, so counting Joan twice would change the
// answer.
func TestEnrich_OpponentWinPercentage_NoDoubleCountRematches(t *testing.T) {
	// Excluding their games against Freddie, Joan went 0-2 against Stevie (0%)
	// and Stevie went 2-0 against Joan (100%). Each counts once: (0 + 100) / 2 =
	// 50. Counting Joan twice would give 33.
	freddie := makeStorageDeck(
		"Freddie",
		1,
		"2024-01-01",
		[]types.Game{
			{Opponent: "Joan", Winner: "Freddie"},
			{Opponent: "Joan", Winner: "Freddie"},
			{Opponent: "Stevie", Winner: "Freddie"},
		},
		[]types.Match{
			{Opponent: "Joan", Round: 1, Winner: "Freddie"},
			{Opponent: "Joan", Round: 3, Winner: "Freddie"},
			{Opponent: "Stevie", Round: 2, Winner: "Freddie"},
		},
		nil,
	)
	joan := makeStorageDeck(
		"Joan",
		1,
		"2024-01-01",
		[]types.Game{
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Stevie", Winner: "Stevie"},
			{Opponent: "Stevie", Winner: "Stevie"},
		},
		[]types.Match{
			{Opponent: "Freddie", Round: 1, Winner: "Freddie"},
			{Opponent: "Freddie", Round: 3, Winner: "Freddie"},
			{Opponent: "Stevie", Round: 2, Winner: "Stevie"},
		},
		nil,
	)
	stevie := makeStorageDeck(
		"Stevie",
		1,
		"2024-01-01",
		[]types.Game{
			{Opponent: "Freddie", Winner: "Freddie"},
			{Opponent: "Joan", Winner: "Stevie"},
			{Opponent: "Joan", Winner: "Stevie"},
		},
		[]types.Match{
			{Opponent: "Freddie", Round: 2, Winner: "Freddie"},
			{Opponent: "Joan", Round: 1, Winner: "Stevie"},
		},
		nil,
	)

	Enrich([]*Deck{freddie, joan, stevie})

	assert.InDelta(t, 50.0, freddie.OpponentWinPercentage, 0.5)
	assert.Equal(t, 2, freddie.RatedOpponents)
}

// Legacy matches store the game tally on Match.Wins/Losses without a nested
// games array. An opponent whose record is entirely legacy still counts.
func TestEnrich_OpponentWinPercentage_LegacyMatchesIncluded(t *testing.T) {
	freddie := &Deck{}
	freddie.Player = "Freddie"
	freddie.Date = "2024-01-01"
	freddie.Matches = []types.Match{
		{
			Opponent: "Joan", Round: 1, Wins: 2, Losses: 0, Winner: "Freddie",
			Games: []types.Game{
				{Opponent: "Joan", Winner: "Freddie"},
				{Opponent: "Joan", Winner: "Freddie"},
			},
		},
	}

	joan := &Deck{}
	joan.Player = "Joan"
	joan.Date = "2024-01-01"
	joan.Matches = []types.Match{
		{
			Opponent: "Freddie", Round: 1, Wins: 0, Losses: 2, Winner: "Freddie",
			Games: []types.Game{
				{Opponent: "Freddie", Winner: "Freddie"},
				{Opponent: "Freddie", Winner: "Freddie"},
			},
		},
		// Legacy match: no nested games, just the tally.
		{Opponent: "Stevie", Round: 2, Wins: 2, Losses: 1, Winner: "Joan"},
	}

	stevie := &Deck{}
	stevie.Player = "Stevie"
	stevie.Date = "2024-01-01"
	stevie.Matches = []types.Match{
		{Opponent: "Joan", Round: 2, Wins: 1, Losses: 2, Winner: "Joan"},
	}

	Enrich([]*Deck{freddie, joan, stevie})

	// Joan's record excluding Freddie is 2-1 against Stevie (66.67%), and
	// Joan is Freddie's only opponent, so the percentage rounds to 67.
	assert.InDelta(t, 67.0, freddie.OpponentWinPercentage, 0.5)
}

func TestFilter_EmptyRequest(t *testing.T) {
	decks := []*Deck{
		makeStorageDeck("Freddie", 1, "2024-01-01", nil, nil, nil),
		makeStorageDeck("Joan", 1, "2024-01-01", nil, nil, nil),
	}

	result := filter(decks, nil)
	assert.Len(t, result, 2)

	result = filter(decks, &DecksRequest{})
	assert.Len(t, result, 2)
}

func TestFilter_ByPlayer(t *testing.T) {
	decks := []*Deck{
		makeStorageDeck("Freddie", 1, "2024-01-01", nil, nil, nil),
		makeStorageDeck("Joan", 1, "2024-01-01", nil, nil, nil),
		makeStorageDeck("freddie", 2, "2024-01-02", nil, nil, nil),
	}

	result := filter(decks, &DecksRequest{Player: "Freddie"})
	assert.Len(t, result, 2)
	for _, d := range result {
		assert.True(t, d.Player == "Freddie" || d.Player == "freddie")
	}

	assert.Empty(t, filter(decks, &DecksRequest{Player: "Ozzy"}))
}

func TestFilter_ByDateRange(t *testing.T) {
	decks := []*Deck{
		makeStorageDeck("Freddie", 1, "2024-01-01", nil, nil, nil),
		makeStorageDeck("Freddie", 2, "2024-06-15", nil, nil, nil),
		makeStorageDeck("Freddie", 3, "2024-12-31", nil, nil, nil),
	}

	result := filter(decks, &DecksRequest{Start: "2024-06-01"})
	assert.Len(t, result, 2)

	result = filter(decks, &DecksRequest{End: "2024-06-30"})
	assert.Len(t, result, 2)

	// Start and end are both inclusive.
	result = filter(decks, &DecksRequest{Start: "2024-06-15", End: "2024-06-15"})
	assert.Len(t, result, 1)
	assert.Equal(t, "2024-06-15", result[0].Date)

	assert.Empty(t, filter(decks, &DecksRequest{Start: "2025-01-01"}))
}

func TestFilter_SkipsDeckWithBadDate(t *testing.T) {
	decks := []*Deck{
		makeStorageDeck("Freddie", 1, "2024-01-01", nil, nil, nil),
		makeStorageDeck("Joan", 1, "last week", nil, nil, nil),
	}

	result := filter(decks, &DecksRequest{Start: "2023-01-01"})
	assert.Len(t, result, 1)
	assert.Equal(t, "Freddie", result[0].Player)
}

func TestFilter_ByDraftSize(t *testing.T) {
	small := makeStorageDeck("Freddie", 1, "2024-01-01", nil, nil, nil)
	small.DraftSize = 4
	large := makeStorageDeck("Joan", 2, "2024-01-01", nil, nil, nil)
	large.DraftSize = 8
	medium := makeStorageDeck("Stevie", 3, "2024-01-01", nil, nil, nil)
	medium.DraftSize = 6

	decks := []*Deck{small, large, medium}

	result := filter(decks, &DecksRequest{DraftSize: 6})
	assert.Len(t, result, 2)
	for _, d := range result {
		assert.GreaterOrEqual(t, d.DraftSize, 6)
	}
}

func TestFilter_UnparseableSearchMatchesNothing(t *testing.T) {
	decks := []*Deck{makeStorageDeck("Freddie", 1, "2024-01-01", nil, nil, nil)}

	result := filter(decks, &DecksRequest{Match: "player:("})
	assert.NotNil(t, result)
	assert.Empty(t, result)

	assert.Len(t, filter(decks, &DecksRequest{Match: "player:Freddie"}), 1)
}

func TestStore_CachesEachCubeSeparately(t *testing.T) {
	s := NewStore(&fakeBackend{})

	_, err := s.List("polyverse", &DecksRequest{})
	assert.NoError(t, err)
	assert.Contains(t, s.caches, "polyverse")
	assert.NotContains(t, s.caches, "aurora")

	_, err = s.List("aurora", &DecksRequest{})
	assert.NoError(t, err)
	assert.Contains(t, s.caches, "polyverse")
	assert.Contains(t, s.caches, "aurora")
}
