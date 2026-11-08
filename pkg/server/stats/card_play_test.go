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

// takenDeck builds a fully recorded deck: it mainboards played and sideboards
// benched, as red spells, with a basic on each board so neither is empty.
func takenDeck(draftID, deckID int, played, benched []string) *storage.Deck {
	d := playDeck("Freddie", draftID, deckID, "2024-01-01", played...)
	d.Mainboard = append(d.Mainboard, types.Card{Name: "Mountain"})
	d.Sideboard = []types.Card{{Name: "Mountain"}}
	for _, n := range benched {
		d.Sideboard = append(d.Sideboard, tendencySpell(n, "R"))
	}
	return d
}

func TestCardPlay_CountsCopies(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	bombardment := []string{card.Name}
	decks := []*storage.Deck{
		// Draft 1's decks never had it, so the draft says nothing about it.
		takenDeck(1, 1, []string{"Shock"}, nil),

		// Draft 2: the cube ran two copies and two decks played them.
		takenDeck(2, 1, bombardment, nil),
		takenDeck(2, 2, bombardment, nil),
		takenDeck(2, 3, []string{"Shock"}, nil),

		// Draft 3: a deck took it and benched it.
		takenDeck(3, 1, []string{"Shock"}, bombardment),
	}

	got := cardPlay(card, decks, nil, &types.Cube{Cards: []types.Card{card}})
	assert.Equal(t, 2, got.Mainboard)
	assert.Equal(t, 2, got.TimesPlayed)
	assert.Equal(t, 3, got.TimesTaken)
	assert.Equal(t, 66.7, got.Rate)
}

func TestCardPlay_BenchedCopyCountsAgainst(t *testing.T) {
	// Two copies in one draft, one played and one benched: half its copies
	// were played, though some deck played it in every draft.
	card := tendencySpell("Temple Garden", "G")
	decks := []*storage.Deck{
		takenDeck(1, 1, []string{card.Name}, nil),
		takenDeck(1, 2, []string{"Shock"}, []string{card.Name}),
	}

	got := cardPlay(card, decks, nil, &types.Cube{Cards: []types.Card{card}})
	assert.Equal(t, 1, got.TimesPlayed)
	assert.Equal(t, 2, got.TimesTaken)
	assert.Equal(t, 50.0, got.Rate)
}

func TestCardPlay_SkipsMainboardOnlyDecks(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	benched := takenDeck(2, 1, []string{"Shock"}, []string{card.Name})

	// A deck with no sideboard can't show what it benched, so it's ignored.
	mainboardOnly := playDeck("Freddie", 1, 1, "2024-01-01", card.Name)
	got := cardPlay(card, []*storage.Deck{mainboardOnly, benched}, nil, &types.Cube{})
	assert.Equal(t, 0, got.TimesPlayed)
	assert.Equal(t, 1, got.TimesTaken)

	// The same deck with its sideboard recorded counts.
	recorded := takenDeck(1, 1, []string{card.Name}, nil)
	got = cardPlay(card, []*storage.Deck{recorded, benched}, nil, &types.Cube{})
	assert.Equal(t, 1, got.TimesPlayed)
	assert.Equal(t, 2, got.TimesTaken)
}

func TestCardPlay_PoolOnlyDeckSkipped(t *testing.T) {
	// A deck recorded only as its pool can't say what it played, so its cards
	// count neither for nor against.
	card := tendencySpell("Goblin Bombardment", "R")
	d := playDeck("Freddie", 1, 1, "2024-01-01")
	d.Pool = []types.Card{card, tendencySpell("Shock", "R")}

	got := cardPlay(card, []*storage.Deck{d}, nil, &types.Cube{})
	assert.Equal(t, 0, got.TimesPlayed)
	assert.Equal(t, 0, got.TimesTaken)

	// Recorded with its choices, the same card counts.
	recorded := takenDeck(1, 1, nil, []string{card.Name})
	got = cardPlay(card, []*storage.Deck{d, recorded}, nil, &types.Cube{})
	assert.Equal(t, 1, got.TimesTaken)
}

func TestCardPlay_SideboardAndDrafts(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	d := playDeck("Freddie", 1, 1, "2024-01-01", "Shock")
	d.Sideboard = []types.Card{card}
	history := []DraftPresence{{State: "played"}, {State: "in"}, {State: "out"}, {State: "unknown"}}

	got := cardPlay(card, []*storage.Deck{d}, history, &types.Cube{})
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

func TestPopularity_NoLabelWhenPeersAllEqual(t *testing.T) {
	peers := []float64{100, 100, 100, 100, 100, 100, 100, 100, 100, 100}
	assert.Equal(t, "", popularity(100, peers))
}

func TestCardPlay_NoPopularityUnderFiveDrafts(t *testing.T) {
	got := popularityFixture(t, 4, 4, func(i int) int { return i % 4 })
	assert.Equal(t, 4, got.TimesTaken)
	assert.Equal(t, "", got.Popularity)
}

func TestCardPlay_PeersUnderFiveDraftsLeftOut(t *testing.T) {
	// Twelve peers played more than the card make it niche, but when eight of
	// them are taken in only four drafts, four peers are left: too few to label.
	peerPlayed := func(i int) int { return 4 + i%3 }
	got := popularityFixture(t, 6, 3, peerPlayed)
	assert.Equal(t, "niche", got.Popularity)

	got = popularityFixture(t, 6, 3, peerPlayed, 4)
	assert.Equal(t, "", got.Popularity)
}

func TestCardPlay_TiesCompareUnrounded(t *testing.T) {
	// The card and six peers sit at 4 of 6 drafts; six more peers at 0. Ties
	// aren't below, so half the peers are below: typical, not popular.
	got := popularityFixture(t, 6, 4, func(i int) int {
		if i < 6 {
			return 4
		}
		return 0
	})
	assert.Equal(t, 66.7, got.Rate)
	assert.Equal(t, "typical", got.Popularity)
}

// popularityFixture runs cardPlay for Goblin Bombardment over drafts one-deck
// drafts, each deck taking every card. The card is played in the first played
// drafts and each red peer i in the first peerPlayed(i) drafts, benched
// otherwise. There are twelve peers, or limited of them when given, the rest
// taken in only four drafts.
func popularityFixture(t *testing.T, drafts, played int, peerPlayed func(int) int, limited ...int) CardPlay {
	t.Helper()
	card := tendencySpell("Goblin Bombardment", "R")
	cube := &types.Cube{Cards: []types.Card{card}}
	for i := 0; i < 12; i++ {
		cube.Cards = append(cube.Cards, tendencySpell(peerName(i), "R"))
	}

	var decks []*storage.Deck
	for draft := 1; draft <= drafts; draft++ {
		var mainboard, benched []string
		if draft <= played {
			mainboard = append(mainboard, card.Name)
		} else {
			benched = append(benched, card.Name)
		}
		for i := 0; i < 12; i++ {
			if len(limited) > 0 && i >= limited[0] && draft > 4 {
				continue
			}
			if draft <= peerPlayed(i) {
				mainboard = append(mainboard, peerName(i))
			} else {
				benched = append(benched, peerName(i))
			}
		}
		decks = append(decks, takenDeck(draft, 1, mainboard, benched))
	}
	return cardPlay(card, decks, nil, cube)
}

func TestCardPlay_RangeWithoutDecks(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	history := []DraftPresence{{State: "played"}, {State: "in"}}

	got := cardPlay(card, nil, history, &types.Cube{Cards: []types.Card{card}})
	assert.Equal(t, 0, got.Mainboard)
	assert.Equal(t, 0, got.TimesTaken)
	assert.Equal(t, "", got.Popularity)
	assert.Equal(t, 2, got.Drafts)
}

// sameColorDrafts builds twenty one-deck drafts that take Goblin Bombardment,
// Counterspell and ten red peers in every one. Bombardment and Counterspell
// are always played, and red peer p only in the first p+1 drafts.
func sameColorDrafts() []*storage.Deck {
	var decks []*storage.Deck
	for i := 0; i < 20; i++ {
		mainboard := []string{"Goblin Bombardment", "Counterspell"}
		var benched []string
		for p := 0; p < 10; p++ {
			if p >= i {
				mainboard = append(mainboard, peerName(p))
			} else {
				benched = append(benched, peerName(p))
			}
		}
		decks = append(decks, takenDeck(i+1, 1, mainboard, benched))
	}
	return decks
}

func TestCardPlay_PopularityAgainstSameColor(t *testing.T) {
	card := tendencySpell("Goblin Bombardment", "R")
	cube := &types.Cube{Cards: []types.Card{card}}
	for i := 0; i < 10; i++ {
		cube.Cards = append(cube.Cards, tendencySpell(peerName(i), "R"))
	}
	cube.Cards = append(cube.Cards, tendencySpell("Counterspell", "U"))

	got := cardPlay(card, sameColorDrafts(), nil, cube)
	assert.Equal(t, "popular", got.Popularity)
	assert.Equal(t, 27.5, got.PeerMedian)
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

func TestCubePopularity_LabelsEveryCardLikeCardPlay(t *testing.T) {
	cube := &types.Cube{Cards: []types.Card{tendencySpell("Goblin Bombardment", "R"), tendencySpell("Counterspell", "U")}}
	for i := 0; i < 10; i++ {
		cube.Cards = append(cube.Cards, tendencySpell(peerName(i), "R"))
	}

	decks := sameColorDrafts()
	rates := playRates(decks)
	got := cubePopularity(cube, rates)

	assert.Equal(t, playRate{Played: 20, Taken: 20}, rates["Goblin Bombardment"])
	assert.Equal(t, "popular", got["Goblin Bombardment"])
	assert.Equal(t, "niche", got[peerName(0)])
	assert.Equal(t, cardPlay(cube.Cards[0], decks, nil, cube).Popularity, got["Goblin Bombardment"])

	// Counterspell has no blue peers to compare with, so it gets no label.
	_, labeled := got["Counterspell"]
	assert.False(t, labeled)
}

func TestCubePopularity_SkipsCardsInTooFewDrafts(t *testing.T) {
	cube := &types.Cube{Cards: []types.Card{tendencySpell("Goblin Bombardment", "R")}}
	rates := map[string]playRate{"Goblin Bombardment": {Played: 4, Taken: minPopularityTaken - 1}}
	for i := 0; i < 12; i++ {
		cube.Cards = append(cube.Cards, tendencySpell(peerName(i), "R"))
		rates[peerName(i)] = playRate{Played: i, Taken: 12}
	}

	got := cubePopularity(cube, rates)
	_, labeled := got["Goblin Bombardment"]
	assert.False(t, labeled)
	assert.Equal(t, "popular", got[peerName(11)])
}
