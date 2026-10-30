package stats

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// tendencyPlayer is the player ID the tendency tests ask about.
const tendencyPlayer = 7

// tendencySpell is a nonland card with the given colors.
func tendencySpell(name string, colors ...string) types.Card {
	return types.Card{Name: name, Types: []string{"Instant"}, Colors: colors}
}

// tendencyDeck builds a deck for playerID in draftID with the given archetype
// and mainboard.
func tendencyDeck(playerID, draftID int, archetype string, cards ...types.Card) *storage.Deck {
	d := &storage.Deck{}
	d.PlayerID = playerID
	d.Player = fmt.Sprintf("player%d", playerID)
	d.Metadata.DraftID = draftID
	d.MacroArchetype = archetype
	d.Mainboard = cards
	return d
}

// decksWithCard builds n decks for playerID, each in its own draft starting at
// firstDraft; the first withCard of them play card, all play a filler spell.
func decksWithCard(playerID, firstDraft, n, withCard int, card string) []*storage.Deck {
	var decks []*storage.Deck
	for i := 0; i < n; i++ {
		cards := []types.Card{tendencySpell(fmt.Sprintf("filler-%d-%d", playerID, i))}
		if i < withCard {
			cards = append(cards, tendencySpell(card))
		}
		decks = append(decks, tendencyDeck(playerID, firstDraft+i, "aggro", cards...))
	}
	return decks
}

// signatureNames lists the names of the signature cards, in order.
func signatureNames(cards []SignatureCard) []string {
	var out []string
	for _, c := range cards {
		out = append(out, c.Name)
	}
	return out
}

func TestSignatureCards_FindsHabit(t *testing.T) {
	mine := decksWithCard(tendencyPlayer, 1, 7, 4, "Goblin Bombardment")
	others := decksWithCard(8, 100, 225, 16, "Goblin Bombardment")

	got := signatureCards(mine, others, cubeLists{})
	require.Len(t, got, 1)
	assert.Equal(t, SignatureCard{Name: "Goblin Bombardment", Decks: 4, Available: 7, Others: 16, OthersAvailable: 225}, got[0])
}

func TestSignatureCards_NeedsThreeDecks(t *testing.T) {
	mine := decksWithCard(tendencyPlayer, 1, 2, 2, "Rare Card")
	others := decksWithCard(8, 100, 50, 0, "Rare Card")

	assert.Empty(t, signatureCards(mine, others, cubeLists{}))
}

func TestSignatureCards_CommonCardNotReturned(t *testing.T) {
	mine := decksWithCard(tendencyPlayer, 1, 8, 4, "Lightning Bolt")
	others := decksWithCard(8, 100, 200, 100, "Lightning Bolt")

	assert.Empty(t, signatureCards(mine, others, cubeLists{}))
}

func TestSignatureCards_RespectsSnapshots(t *testing.T) {
	// The card is in 3 of the player's 4 decks and 5 of 60 others. Draft 4
	// and drafts 100-129 didn't have it, so their decks leave both denominators.
	mine := decksWithCard(tendencyPlayer, 1, 4, 3, "New Card")
	others := decksWithCard(8, 100, 60, 0, "New Card")
	for i := 30; i < 35; i++ {
		others[i].Mainboard = append(others[i].Mainboard, tendencySpell("New Card"))
	}
	cubes := cubeLists{4: {}}
	for draft := 100; draft < 130; draft++ {
		cubes[draft] = map[string]bool{}
	}

	got := signatureCards(mine, others, cubes)
	require.Len(t, got, 1)
	assert.Equal(t, 3, got[0].Available)
	assert.Equal(t, 30, got[0].OthersAvailable)
}

func TestSignatureCards_NoSnapshotCountsAvailable(t *testing.T) {
	mine := decksWithCard(tendencyPlayer, 1, 5, 3, "Pet Card")
	others := decksWithCard(8, 100, 60, 1, "Pet Card")

	got := signatureCards(mine, others, cubeLists{})
	require.Len(t, got, 1)
	assert.Equal(t, 5, got[0].Available)
	assert.Equal(t, 60, got[0].OthersAvailable)
}

func TestSignatureCards_NobodyElsePlaysIt(t *testing.T) {
	mine := decksWithCard(tendencyPlayer, 1, 5, 3, "Pet Card")
	others := decksWithCard(8, 100, 60, 0, "Pet Card")

	assert.Equal(t, []string{"Pet Card"}, signatureNames(signatureCards(mine, others, cubeLists{})))
}

func TestSignatureCards_AtMostFive(t *testing.T) {
	// Seven pet cards; the player plays card i in 3+i of 10 decks, so higher
	// counts are less likely by chance and come first.
	var mine []*storage.Deck
	for d := 0; d < 10; d++ {
		cards := []types.Card{tendencySpell(fmt.Sprintf("filler%d", d))}
		for i := 0; i < 7; i++ {
			if d < 3+i {
				cards = append(cards, tendencySpell(fmt.Sprintf("pet%d", i)))
			}
		}
		mine = append(mine, tendencyDeck(tendencyPlayer, d+1, "aggro", cards...))
	}
	others := decksWithCard(8, 100, 100, 0, "nothing")

	got := signatureNames(signatureCards(mine, others, cubeLists{}))
	assert.Equal(t, []string{"pet6", "pet5", "pet4", "pet3", "pet2"}, got)
}

// colorShareDeck is a deck for player whose mainboard has the given number of
// cards of each color.
func colorShareDeck(playerID, draftID int, counts map[string]int) *storage.Deck {
	var cards []types.Card
	for color, n := range counts {
		for i := 0; i < n; i++ {
			cards = append(cards, tendencySpell(fmt.Sprintf("%s-%d-%d", color, playerID, i), color))
		}
	}
	return tendencyDeck(playerID, draftID, "aggro", cards...)
}

func TestTendencies_MainColors(t *testing.T) {
	mine := []*storage.Deck{colorShareDeck(tendencyPlayer, 1, map[string]int{
		"R": 10,
		"W": 6,
		"B": 3,
		"G": 1,
	})}

	got := playerTendencies(tendencyPlayer, mine, mine, nil, cubeLists{})
	assert.Equal(t, []string{"W", "R"}, got.MainColors)
	assert.Equal(t, 50.0, got.ColorShares["R"])
	assert.Equal(t, 5.0, got.ColorShares["G"])
}

func TestTendencies_ColorGap(t *testing.T) {
	mine := []*storage.Deck{colorShareDeck(tendencyPlayer, 1, map[string]int{
		"U": 1,
		"R": 24,
	})}
	others := []*storage.Deck{colorShareDeck(8, 1, map[string]int{
		"U": 30,
		"R": 45,
	})}
	baseline := append(append([]*storage.Deck{}, mine...), others...)

	got := playerTendencies(tendencyPlayer, mine, baseline, nil, cubeLists{})
	require.NotNil(t, got.ColorGap)
	assert.Equal(t, "U", got.ColorGap.Color)
	assert.Equal(t, 4.0, got.ColorGap.PlayerShare)
	assert.Equal(t, 31.0, got.ColorGap.CubeShare)
}

func TestTendencies_ArchetypesAndPackages(t *testing.T) {
	graveyard := design.PackageCards{
		Name:  "Graveyard",
		Wires: []design.WireCards{{Sources: cardSet("gy1", "gy2"), Targets: cardSet("gy3", "gy4"), NeedSources: 2, NeedTargets: 2}},
	}
	gyCards := []types.Card{tendencySpell("gy1"), tendencySpell("gy2"), tendencySpell("gy3"), tendencySpell("gy4")}
	mine := []*storage.Deck{
		tendencyDeck(tendencyPlayer, 1, "aggro", gyCards...),
		tendencyDeck(tendencyPlayer, 2, "midrange", gyCards...),
		tendencyDeck(tendencyPlayer, 3, "aggro", tendencySpell("x")),
		tendencyDeck(tendencyPlayer, 4, "", tendencySpell("y")),
	}

	got := playerTendencies(tendencyPlayer, mine, mine, []design.PackageCards{graveyard}, cubeLists{})
	assert.Equal(t, []NamedCount{{Name: "aggro", Count: 2}, {Name: "midrange", Count: 1}}, got.Archetypes)
	assert.Equal(t, []NamedCount{{Name: "Graveyard", Count: 2}}, got.Packages)
}

func TestTendencies_CountsMatchesWithResults(t *testing.T) {
	d := tendencyDeck(tendencyPlayer, 1, "aggro", tendencySpell("x"))
	d.Matches = []types.Match{
		{Opponent: "a", Wins: 2, Losses: 0, Winner: d.Player},
		{Opponent: "b", Wins: 1, Losses: 1, Draws: 1},
		{Opponent: "c"},
	}

	got := playerTendencies(tendencyPlayer, []*storage.Deck{d}, []*storage.Deck{d}, nil, cubeLists{})
	assert.Equal(t, 2, got.Matches)
}

func TestTendencies_OneDeck(t *testing.T) {
	mine := []*storage.Deck{tendencyDeck(tendencyPlayer, 1, "control", tendencySpell("x", "U"))}

	got := playerTendencies(tendencyPlayer, mine, mine, nil, cubeLists{})
	assert.Equal(t, []NamedCount{{Name: "control", Count: 1}}, got.Archetypes)
	assert.NotNil(t, got.SignatureCards)
	assert.Empty(t, got.SignatureCards)
	assert.NotNil(t, got.Packages)
}
