package stats

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// archetypeDeck builds a deck with a macro archetype and tags, mainboarding
// the named red spells.
func archetypeDeck(player string, draftID, deckID int, macro string, labels []string, names ...string) *storage.Deck {
	d := playDeck(player, draftID, deckID, "2024-01-01", names...)
	d.MacroArchetype = macro
	d.Labels = labels
	return d
}

func TestHasArchetype_MacroOrTag(t *testing.T) {
	d := archetypeDeck("Freddie", 1, 1, "aggro", []string{"Burn"})

	assert.True(t, hasArchetype(d, "aggro"))
	assert.True(t, hasArchetype(d, "Burn"))
	assert.False(t, hasArchetype(d, "control"))
}

func TestArchetypeCards_SharesAndFitOrder(t *testing.T) {
	aggro1 := archetypeDeck("Freddie", 1, 1, "aggro", nil, "Goblin Guide", "Shock")
	aggro2 := archetypeDeck("Ozzy", 1, 2, "aggro", nil, "Goblin Guide")
	control := archetypeDeck("Joan", 1, 3, "control", nil, "Shock")
	ranged := []*storage.Deck{aggro1, aggro2, control}

	got := archetypeCards([]*storage.Deck{aggro1, aggro2}, ranged)
	require.Len(t, got, 2)

	// Goblin Guide is in both aggro decks and only those: it fits best.
	assert.Equal(t, ArchetypeCard{Name: "Goblin Guide", Decks: 2, InShare: 100, OfCardDecks: 100, Fit: 100}, got[0])

	// Shock is in half the aggro decks, and half its decks are aggro.
	assert.Equal(t, ArchetypeCard{Name: "Shock", Decks: 1, InShare: 50, OfCardDecks: 50, Fit: 25}, got[1])
}

func TestArchetypeTraits_LeavesOutItselfAndAnonymousSeats(t *testing.T) {
	named := archetypeDeck("Freddie", 1, 1, "aggro", []string{"Burn"}, "Shock")
	seat := archetypeDeck("p3", 1, 3, "midrange", []string{"Burn"}, "Shock")
	seat.PlayerID = 0

	paired, colors, players := archetypeTraits("Burn", []*storage.Deck{named, seat})
	assert.ElementsMatch(t, []NamedCount{{Name: "aggro", Count: 1}, {Name: "midrange", Count: 1}}, paired)
	assert.Equal(t, []NamedCount{{Name: "R", Count: 2}}, colors)
	assert.Equal(t, []NamedCount{{Name: "Freddie", Count: 1}}, players)
}

func TestBuildArchetypePage_SharePerDraftAndStatsRow(t *testing.T) {
	all := []*storage.Deck{
		archetypeDeck("Freddie", 1, 1, "aggro", nil, "Shock"),
		archetypeDeck("Ozzy", 1, 2, "control", nil, "Shock"),
		archetypeDeck("Freddie", 2, 1, "aggro", nil, "Shock"),
	}

	page := buildArchetypePage("aggro", all, all, "", "", zForConfidence(0.95))
	require.Len(t, page.OverTime, 2)
	assert.Equal(t, 1, page.OverTime[0].Built)
	assert.Equal(t, 2, page.OverTime[0].Decks)
	assert.Equal(t, 1, page.OverTime[1].Built)
	assert.Equal(t, 2, page.Stats.Count)
	assert.Len(t, page.Decks, 2)
}

func TestBuildArchetypePage_NoDecksInRange(t *testing.T) {
	all := []*storage.Deck{archetypeDeck("Freddie", 1, 1, "aggro", []string{"Burn"}, "Shock")}

	page := buildArchetypePage("Burn", all, nil, "", "", zForConfidence(0.95))
	assert.Equal(t, "Burn", page.Stats.Type)
	assert.Equal(t, 0, page.Stats.Count)
	assert.Empty(t, page.TopCards)
}

func TestArchetypePageHandler_UnknownNameIs404(t *testing.T) {
	decks := []*storage.Deck{archetypeDeck("Freddie", 1, 1, "aggro", []string{"Burn"}, "Shock")}
	handler := ArchetypePageHandler(&mockDeckStorage{decks: decks}, testCubeSource{})

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/stats/archetype?name=Reanimator", nil))
	assert.Equal(t, http.StatusNotFound, rr.Code)

	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/stats/archetype?name=Burn", nil))
	assert.Equal(t, http.StatusOK, rr.Code)
}
