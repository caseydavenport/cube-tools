package deckquery

import (
	"errors"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// graveyardEdges is a triangle, so a deck holding all three cards forms a
// graveyard package and a deck holding two doesn't.
func graveyardEdges() []graph.Edge {
	return []graph.Edge{
		{A: "gy1", B: "gy2", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "gy2", B: "gy3", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "gy1", B: "gy3", Weight: 5, Labels: []string{"Graveyard"}},
	}
}

func deck(playerID int, names ...string) *storage.Deck {
	d := &storage.Deck{}
	d.PlayerID = playerID
	d.Metadata.DraftID = 1
	d.Date = "2026-03-01"
	for _, n := range names {
		d.Mainboard = append(d.Mainboard, types.Card{Name: n})
	}
	return d
}

// testStore holds Ozzy's deck, which forms the graveyard package, and Stevie's,
// which doesn't.
func testStore() storage.DeckStorage {
	return memory.NewStore(func(b *memory.Backend) {
		b.SeedPlayers(players.Player{ID: 1, Name: "Ozzy"}, players.Player{ID: 2, Name: "Stevie"})
		b.Seed("testcube", deck(1, "gy1", "gy2", "gy3"), deck(2, "gy1", "gy2", "Forest"))
	})
}

func staticEdges(string) ([]graph.Edge, error) {
	return graveyardEdges(), nil
}

func playersOf(decks []*storage.Deck) []string {
	var out []string
	for _, d := range decks {
		out = append(out, d.Player)
	}
	return out
}

func TestDecksCommunityFilters(t *testing.T) {
	q := New(testStore(), nil, staticEdges)
	decks, err := q.Decks("testcube", &storage.DecksRequest{Match: "community:graveyard"})
	require.NoError(t, err)
	assert.Equal(t, []string{"Ozzy"}, playersOf(decks))
}

func TestDecksNegatedCommunity(t *testing.T) {
	q := New(testStore(), nil, staticEdges)
	decks, err := q.Decks("testcube", &storage.DecksRequest{Match: "community!=graveyard"})
	require.NoError(t, err)
	assert.Equal(t, []string{"Stevie"}, playersOf(decks))
}

func TestDecksSkipsLoaderWithoutCommunity(t *testing.T) {
	calls := 0
	q := New(testStore(), nil, func(string) ([]graph.Edge, error) {
		calls++
		return graveyardEdges(), nil
	})
	for _, match := range []string{"Community Garden", "arch:aggro"} {
		_, err := q.Decks("testcube", &storage.DecksRequest{Match: match})
		require.NoError(t, err)
	}
	assert.Equal(t, 0, calls)
}

func TestDecksLoaderErrorFails(t *testing.T) {
	q := New(testStore(), nil, func(string) ([]graph.Edge, error) { return nil, errors.New("no rules") })
	_, err := q.Decks("testcube", &storage.DecksRequest{Match: "community:graveyard"})
	assert.ErrorContains(t, err, "no rules")
}

func TestDecksLeavesRequestUntouched(t *testing.T) {
	q := New(testStore(), nil, staticEdges)
	dr := &storage.DecksRequest{Match: "community:graveyard"}
	_, err := q.Decks("testcube", dr)
	require.NoError(t, err)
	assert.Nil(t, dr.CommunityEdges)
}

func TestDecksNilRequestListsAll(t *testing.T) {
	q := New(testStore(), nil, staticEdges)
	decks, err := q.Decks("testcube", nil)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"Ozzy", "Stevie"}, playersOf(decks))
}
