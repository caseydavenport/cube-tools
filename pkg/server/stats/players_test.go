package stats

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestPlayerStats_OpponentWinPercent_Weighted(t *testing.T) {
	// Deck 1: 3 matches, OWP=60
	// Deck 2: 1 match, OWP=40
	// Weighted: (60*3 + 40*1) / 4 = 220/4 = 55, NOT (60+40)/2 = 50
	firstDeck := &storage.Deck{}
	firstDeck.Player = "Freddie"
	firstDeck.Matches = []types.Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Stevie"},
		{Opponent: "Joan", Winner: "Freddie"},
	}
	foldGamesIntoMatches(firstDeck, "Freddie", []types.Game{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Ozzy", Winner: "Freddie"},
	})
	firstDeck.OpponentWinPercentage = 60
	firstDeck.RatedOpponents = 3

	secondDeck := &storage.Deck{}
	secondDeck.Player = "Freddie"
	secondDeck.Matches = []types.Match{
		{Opponent: "Mick", Winner: "Mick"},
	}
	foldGamesIntoMatches(secondDeck, "Freddie", []types.Game{
		{Opponent: "Mick", Winner: "Mick"},
	})
	secondDeck.OpponentWinPercentage = 40
	secondDeck.RatedOpponents = 1

	handler := PlayerStatsHandler(&mockDeckStorage{decks: []*storage.Deck{firstDeck, secondDeck}}, testCubeSource{})
	req := httptest.NewRequest(http.MethodGet, "/api/stats/players", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp PlayerStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	freddie := resp.Players["Freddie"]
	assert.NotNil(t, freddie)

	// Weighted: round((60*3 + 40*1) / 4) = round(55) = 55
	assert.InDelta(t, 55.0, freddie.OpponentWinPercent, 0.5)
}

func TestPlayerStats_OpponentWinPercent_SkipsUnratedDecks(t *testing.T) {
	// A deck with no rated opponents, from an old record or a two-player
	// draft, has an unknown opponent win % that reads as 0. Averaging it in
	// would drag the player down to 30.
	named := &storage.Deck{}
	named.Player = "Ozzy"
	named.Matches = []types.Match{{Opponent: "Stevie", Wins: 2, Losses: 1}}
	named.OpponentWinPercentage = 60
	named.RatedOpponents = 1

	unnamed := &storage.Deck{}
	unnamed.Player = "Ozzy"
	unnamed.Matches = []types.Match{{Wins: 2, Losses: 1}}

	handler := PlayerStatsHandler(&mockDeckStorage{decks: []*storage.Deck{named, unnamed}}, testCubeSource{})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/stats/players", nil))

	var resp PlayerStatsResponse
	assert.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.InDelta(t, 60.0, resp.Players["Ozzy"].OpponentWinPercent, 0.5)
}

func TestPlayerStats_BasicAggregation(t *testing.T) {
	aggroDeck := makeStorageDeck("Freddie", 1, []string{"aggro"}, []types.Game{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Ozzy", Winner: "Ozzy"},
	}, []types.Match{
		{Opponent: "Ozzy", Winner: "Freddie"},
		{Opponent: "Stevie", Winner: "Freddie"},
		{Opponent: "Joan", Winner: "Freddie"},
	})

	controlDeck := makeStorageDeck("Freddie", 2, []string{"control"}, []types.Game{
		{Opponent: "Mick", Winner: "Mick"},
		{Opponent: "Mick", Winner: "Freddie"},
	}, []types.Match{
		{Opponent: "Mick", Winner: "Mick"},
		{Opponent: "Frank", Winner: "Frank"},
		{Opponent: "Grace", Winner: "Grace"},
	})

	handler := PlayerStatsHandler(&mockDeckStorage{decks: []*storage.Deck{aggroDeck, controlDeck}}, testCubeSource{})
	req := httptest.NewRequest(http.MethodGet, "/api/stats/players", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var resp PlayerStatsResponse
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	freddie := resp.Players["Freddie"]
	assert.NotNil(t, freddie)
	assert.Equal(t, 2, freddie.NumDecks)

	// 2 + 1
	assert.Equal(t, 3, freddie.Wins)

	// 1 + 1
	assert.Equal(t, 2, freddie.Losses)

	// 3 + 2
	assert.Equal(t, 5, freddie.Games)
	assert.Equal(t, 1, freddie.Trophies)
	assert.Equal(t, 1, freddie.LastPlace)
}

func TestPlayerStatsSkipsAnonymous(t *testing.T) {
	seat := func(draft int) *storage.Deck {
		d := makeStorageDeck("p3", draft, nil, nil, []types.Match{{OpponentID: 1, Wins: 2}})
		d.ID = 3
		return d
	}
	named := func(draft int) *storage.Deck {
		d := makeStorageDeck("Freddie", draft, nil, nil, []types.Match{{OpponentID: 3, Wins: 2}})
		d.ID, d.PlayerID = 1, 1
		return d
	}
	decks := []*storage.Deck{seat(1), seat(2), named(1), named(2)}

	handler := PlayerStatsHandler(&mockDeckStorage{decks: decks}, testCubeSource{})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/stats/players", nil))

	var resp PlayerStatsResponse
	assert.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Len(t, resp.Players, 1)
	freddie := resp.Players["Freddie"]
	if assert.NotNil(t, freddie) {
		assert.Equal(t, 1, freddie.ID)
		assert.Equal(t, 2, freddie.NumDecks)
	}
}

// playerStatsFor serves /api/stats/players over decks with the given query
// string and decodes the response.
func playerStatsFor(t *testing.T, decks []*storage.Deck, query string) PlayerStatsResponse {
	t.Helper()
	handler := PlayerStatsHandler(&mockDeckStorage{decks: decks}, testCubeSource{})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/stats/players?"+query, nil))
	var resp PlayerStatsResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	return resp
}

// eightAndTwo is one aggro, white-red deck for Freddie that went 8-2 in games
// against Ozzy.
func eightAndTwo() *storage.Deck {
	d := makeStorageDeck("Freddie", 1, nil, nil, []types.Match{{Opponent: "Ozzy", Wins: 8, Losses: 2}})
	d.MacroArchetype = "aggro"
	d.Mainboard = []types.Card{{Name: "Boros Charm", Colors: []string{"W", "R"}}}
	d.Colors = []string{"W", "R"}
	return d
}

func TestPlayerStats_BayesAndInterval(t *testing.T) {
	freddie := playerStatsFor(t, []*storage.Deck{eightAndTwo()}, "").Players["Freddie"]
	require.NotNil(t, freddie)
	assert.Greater(t, freddie.BayesianWinPercent, 50.0)
	assert.Less(t, freddie.BayesianWinPercent, 80.0)
	assert.Less(t, freddie.WinPercentLow, 80.0)
	assert.Greater(t, freddie.WinPercentHigh, 80.0)
}

func TestPlayerStats_IntervalFollowsConfidence(t *testing.T) {
	narrow := playerStatsFor(t, []*storage.Deck{eightAndTwo()}, "confidence=0.8").Players["Freddie"]
	wide := playerStatsFor(t, []*storage.Deck{eightAndTwo()}, "confidence=0.95").Players["Freddie"]
	assert.Less(t, wide.WinPercentLow, narrow.WinPercentLow)
	assert.Greater(t, wide.WinPercentHigh, narrow.WinPercentHigh)
}

func TestPlayerStats_SubRowsHaveBayes(t *testing.T) {
	freddie := playerStatsFor(t, []*storage.Deck{eightAndTwo()}, "").Players["Freddie"]
	aggro := freddie.ArchetypeStats["aggro"]
	require.NotNil(t, aggro)
	assert.Greater(t, aggro.BayesianWinPercent, 50.0)
	assert.Greater(t, aggro.WinPercentHigh, 0.0)

	white := freddie.ColorStats["W"]
	require.NotNil(t, white)
	assert.Greater(t, white.BayesianWinPercent, 50.0)
	assert.Greater(t, white.WinPercentHigh, 0.0)
}

func TestPlayerStats_Opponents(t *testing.T) {
	d := makeStorageDeck("Ozzy", 1, nil, nil, []types.Match{
		{Opponent: "Stevie", Wins: 2, Losses: 1},
		{Opponent: "p3", Wins: 2},
		{Wins: 2},
	})
	ozzy := playerStatsFor(t, []*storage.Deck{d}, "").Players["Ozzy"]
	require.NotNil(t, ozzy)
	require.Len(t, ozzy.Opponents, 1, "seat labels and unnamed opponents are skipped")
	stevie := ozzy.Opponents["Stevie"]
	require.NotNil(t, stevie)
	assert.Equal(t, 2, stevie.Wins)
	assert.Equal(t, 1, stevie.Losses)
	assert.Greater(t, stevie.BayesianWinPercent, 50.0)
}

func TestPlayerStats_Buckets(t *testing.T) {
	first := makeStorageDeck("Joan", 1, nil, nil, []types.Match{{Opponent: "Ozzy", Wins: 2}})
	first.Date = "2026-01-01"
	second := makeStorageDeck("Stevie", 2, nil, nil, []types.Match{{Opponent: "Ozzy", Wins: 2}})
	second.Date = "2026-02-01"

	resp := playerStatsFor(t, []*storage.Deck{first, second}, "bucket_size=1")
	require.Len(t, resp.Buckets, 2)
	assert.Contains(t, resp.Buckets[0].Players, "Joan")
	assert.NotContains(t, resp.Buckets[0].Players, "Stevie")
	assert.Contains(t, resp.Buckets[1].Players, "Stevie")
	assert.Equal(t, "2026-01-01", resp.Buckets[0].Start)
}

// playerFilterStore returns only Freddie's decks when the request carries a
// deck filter, as a player: filter would, and every deck otherwise.
type playerFilterStore struct {
	mockDeckStorage
}

// List answers filtered requests with Freddie's decks only.
func (s *playerFilterStore) List(cube string, req *storage.DecksRequest) ([]*storage.Deck, error) {
	if req.Match == "" {
		return s.decks, nil
	}
	var out []*storage.Deck
	for _, d := range s.decks {
		if d.Player == "Freddie" {
			out = append(out, d)
		}
	}
	return out, nil
}

// petCardDecks gives Freddie (player 1) five decks, three with Pet Card, and
// Ozzy (player 2) sixty decks without it. Each deck won one match.
func petCardDecks() []*storage.Deck {
	var decks []*storage.Deck
	for i := 0; i < 5; i++ {
		d := makeStorageDeck("Freddie", i+1, nil, nil, []types.Match{{Opponent: "Ozzy", Wins: 2, Winner: "Freddie"}})
		d.PlayerID = 1
		d.Mainboard = []types.Card{{Name: fmt.Sprintf("filler%d", i)}}
		if i < 3 {
			d.Mainboard = append(d.Mainboard, types.Card{Name: "Pet Card"})
		}
		decks = append(decks, d)
	}
	for i := 0; i < 60; i++ {
		d := makeStorageDeck("Ozzy", 100+i, nil, nil, nil)
		d.PlayerID = 2
		d.Mainboard = []types.Card{{Name: fmt.Sprintf("ozzy%d", i)}}
		decks = append(decks, d)
	}
	return decks
}

func TestPlayerStats_Tendencies(t *testing.T) {
	freddie := playerStatsFor(t, petCardDecks(), "").Players["Freddie"]
	require.NotNil(t, freddie)
	assert.Equal(t, 5, freddie.Tendencies.Matches)
	require.Len(t, freddie.Tendencies.SignatureCards, 1)
	assert.Equal(t, "Pet Card", freddie.Tendencies.SignatureCards[0].Name)
}

func TestPlayerStats_BaselineIgnoresDeckFilter(t *testing.T) {
	store := &playerFilterStore{mockDeckStorage{decks: petCardDecks()}}
	rr := httptest.NewRecorder()
	PlayerStatsHandler(store, testCubeSource{}).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, `/api/stats/players?match=player:"Freddie"`, nil))

	var resp PlayerStatsResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	freddie := resp.Players["Freddie"]
	require.NotNil(t, freddie)
	assert.Equal(t, 60, freddie.Tendencies.SignatureCards[0].OthersAvailable)
}

func TestPlayerStats_NegativeBucketSize(t *testing.T) {
	resp := playerStatsFor(t, petCardDecks(), "bucket_size=-1")
	assert.NotNil(t, resp.Players["Freddie"])
}

// BenchmarkPlayerStats serves the player stats for a cube of 270 decks by 50
// players, 40 spells each from a pool of 400.
func BenchmarkPlayerStats(b *testing.B) {
	var decks []*storage.Deck
	for i := 0; i < 270; i++ {
		d := makeStorageDeck(fmt.Sprintf("player%d", i%50), i/8+1, nil, nil, []types.Match{{Opponent: "x", Wins: 2, Winner: fmt.Sprintf("player%d", i%50)}})
		d.PlayerID = i%50 + 1
		for c := 0; c < 40; c++ {
			d.Mainboard = append(d.Mainboard, types.Card{Name: fmt.Sprintf("card%d", (i*7+c*13)%400)})
		}
		decks = append(decks, d)
	}
	handler := PlayerStatsHandler(&mockDeckStorage{decks: decks}, testCubeSource{})
	b.ReportAllocs()
	for b.Loop() {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/stats/players", nil))
	}
}
