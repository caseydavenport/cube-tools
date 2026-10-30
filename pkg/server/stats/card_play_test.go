package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// playDeck builds a named player's deck in a draft on a date, mainboarding
// the named red spells.
func playDeck(player string, draftID, deckID int, date string, names ...string) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.PlayerID = 1
	d.ID = deckID
	d.Metadata.DraftID = draftID
	d.Date = date
	for _, n := range names {
		d.Mainboard = append(d.Mainboard, tendencySpell(n, "R"))
	}
	return d
}

func TestDraftHistory_States(t *testing.T) {
	all := []*storage.Deck{
		playDeck("Freddie", 1, 1, "2024-01-01", "Goblin Bombardment"),
		playDeck("Freddie", 2, 1, "2024-07-01", "Shock"),
		playDeck("Freddie", 3, 1, "2024-08-01", "Shock"),
		playDeck("Freddie", 4, 1, "2024-09-01", "Shock"),
	}
	cubes := cubeLists{
		1: {"Shock": true},
		2: {"Goblin Bombardment": true, "Shock": true},
		4: {"Shock": true},
	}

	got := draftHistory("Goblin Bombardment", all, cubes, "2024-06-01", "")
	want := []DraftPresence{
		{DraftID: 1, Date: "2024-01-01", State: "played", InRange: false},
		{DraftID: 2, Date: "2024-07-01", State: "in", InRange: true},
		{DraftID: 3, Date: "2024-08-01", State: "unknown", InRange: true},
		{DraftID: 4, Date: "2024-09-01", State: "out", InRange: true},
	}
	assert.Equal(t, want, got)
}

func TestCardPlay_CountsDraftsNotDecks(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	decks := []*storage.Deck{
		// Draft 1's cube didn't have it.
		playDeck("Freddie", 1, 1, "2024-01-01", "Shock"),
		playDeck("Ozzy", 1, 2, "2024-01-01", "Shock"),

		// Draft 2 had it and two decks played it, from two copies.
		playDeck("Freddie", 2, 1, "2024-02-01", "Goblin Bombardment"),
		playDeck("Ozzy", 2, 2, "2024-02-01", "Goblin Bombardment"),
		playDeck("Joan", 2, 3, "2024-02-01", "Shock"),

		// Draft 3 had it and nobody played it.
		playDeck("Freddie", 3, 1, "2024-03-01", "Shock"),
	}
	cubes := cubeLists{1: {"Shock": true}, 2: {"Shock": true, "Goblin Bombardment": true}, 3: {"Shock": true, "Goblin Bombardment": true}}

	got := cardPlay(card, withSpells(decks), nil, &types.Cube{Cards: []types.Card{card}}, cubes)
	assert.Equal(t, 2, got.Mainboard)
	assert.Equal(t, 1, got.DraftsPlayed)
	assert.Equal(t, 2, got.DraftsAvailable)
	assert.Equal(t, 50.0, got.Rate)

	// A draft with no cube list counts only when a deck played the card there,
	// since otherwise there's no telling whether its cube had it.
	unknown := cardPlay(card, withSpells(decks), nil, &types.Cube{Cards: []types.Card{card}}, cubeLists{})
	assert.Equal(t, 1, unknown.DraftsAvailable)
	assert.Equal(t, 1, unknown.DraftsPlayed)
}

func TestCardPlay_PlayedProvesAvailable(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	decks := []*storage.Deck{playDeck("Freddie", 1, 1, "2024-01-01", "Goblin Bombardment")}
	got := cardPlay(card, withSpells(decks), nil, &types.Cube{}, cubeLists{1: {"Shock": true}})
	assert.Equal(t, 1, got.DraftsAvailable)
	assert.Equal(t, 1, got.DraftsPlayed)
}

func TestCardPlay_SideboardAndDrafts(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	d := playDeck("Freddie", 1, 1, "2024-01-01", "Shock")
	d.Sideboard = []types.Card{card}
	history := []DraftPresence{{State: "played"}, {State: "in"}, {State: "out"}, {State: "unknown"}}

	got := cardPlay(card, withSpells([]*storage.Deck{d}), history, &types.Cube{}, cubeLists{})
	assert.Equal(t, 1, got.Sideboard)
	assert.Equal(t, 4, got.Drafts)
	assert.Equal(t, 2, got.DraftsInCube)
	assert.Equal(t, "R", got.Peers)
}

func TestPopularity_Thresholds(t *testing.T) {
	peers := []float64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}
	assert.Equal(t, "popular", popularity(11, peers))
	assert.Equal(t, "niche", popularity(2, peers))
	assert.Equal(t, "typical", popularity(6, peers))
	assert.Equal(t, "", popularity(6, peers[:9]))
}

func TestCardPlay_RangeWithoutDecks(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	history := []DraftPresence{{State: "played"}, {State: "in"}}

	got := cardPlay(card, nil, history, &types.Cube{Cards: []types.Card{card}}, cubeLists{})
	assert.Equal(t, 0, got.Mainboard)
	assert.Equal(t, 0, got.DraftsAvailable)
	assert.Equal(t, "", got.Popularity)
	assert.Equal(t, 2, got.Drafts)
}

func TestCardPlay_PopularityAgainstSameColor(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	cube := &types.Cube{Cards: []types.Card{card}}
	var decks []*storage.Deck

	// Twenty one-deck drafts: ten red peers each in one of them, Bombardment in
	// all of them, and a blue card in every one that doesn't count against it.
	for i := 0; i < 20; i++ {
		names := []string{"Goblin Bombardment", "Counterspell"}
		if i < 10 {
			names = append(names, peerName(i))
		}
		decks = append(decks, playDeck("Freddie", i+1, 1, "2024-01-01", names...))
	}
	for i := 0; i < 10; i++ {
		cube.Cards = append(cube.Cards, tendencySpell(peerName(i), "R"))
	}
	cube.Cards = append(cube.Cards, tendencySpell("Counterspell", "U"))

	// Every draft's cube list held every card.
	cubes := cubeLists{}
	for i := 1; i <= 20; i++ {
		cubes[i] = map[string]bool{}
		for _, c := range cube.Cards {
			cubes[i][c.Name] = true
		}
	}

	got := cardPlay(card, withSpells(decks), nil, cube, cubes)
	assert.Equal(t, "popular", got.Popularity)
	assert.Equal(t, 5.0, got.PeerMedian)
}

// peerName names the i-th filler red card.
func peerName(i int) string {
	return string(rune('A'+i)) + " Red Card"
}

func TestColorBucket(t *testing.T) {
	assert.Equal(t, "R", colorBucket(types.Card{Colors: []string{"R"}}))
	assert.Equal(t, "M", colorBucket(types.Card{Colors: []string{"B", "R"}}))
	assert.Equal(t, "C", colorBucket(types.Card{}))
}

func TestCardDecks_NewestFirst(t *testing.T) {
	older := playDeck("Freddie", 1, 2, "2024-01-01", "Goblin Bombardment")
	older.Matches = []types.Match{{Opponent: "Ozzy", Winner: "Freddie"}, {Opponent: "Joan", Winner: "Joan"}}
	newer := playDeck("Ozzy", 2, 5, "2024-03-01", "Goblin Bombardment")
	without := playDeck("Joan", 2, 6, "2024-03-01", "Shock")
	older.MacroArchetype = "aggro"

	got := cardDecks("Goblin Bombardment", []*storage.Deck{older, without, newer})
	require.Len(t, got, 2)
	assert.Equal(t, "2/5", got[0].Ref)
	assert.Equal(t, CardDeck{Ref: "1/2", Date: "2024-01-01", Player: "Freddie", Colors: "R", Archetype: "aggro", Wins: 1, Losses: 1}, got[1])
}

func TestWhoPlays_SkipsAnonymousPlayers(t *testing.T) {
	named := playDeck("Freddie", 1, 1, "2024-01-01", "Goblin Bombardment")
	named.MacroArchetype = "aggro"
	seat := playDeck("p3", 1, 3, "2024-01-01", "Goblin Bombardment")
	seat.PlayerID = 0
	without := playDeck("Ozzy", 1, 2, "2024-01-01", "Shock")

	colors, archetypes, players := whoPlays("Goblin Bombardment", []*storage.Deck{named, seat, without})
	assert.Equal(t, []NamedCount{{Name: "R", Count: 2}}, colors)
	assert.Equal(t, []NamedCount{{Name: "aggro", Count: 1}}, archetypes)
	assert.Equal(t, []NamedCount{{Name: "Freddie", Count: 1}}, players)
}
