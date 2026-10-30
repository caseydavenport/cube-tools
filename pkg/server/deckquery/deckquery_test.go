package deckquery

import (
	"errors"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	logtest "github.com/sirupsen/logrus/hooks/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// graveyardPackages wires three graveyard cards to each other, so a deck
// holding all three builds the package and a deck holding two doesn't.
func graveyardPackages() []design.PackageCards {
	return []design.PackageCards{{
		Name: "Graveyard",
		Wires: []design.WireCards{{
			Sources: map[string]bool{
				"gy1": true,
				"gy2": true,
				"gy3": true,
			},
			Targets: map[string]bool{
				"gy1": true,
				"gy2": true,
				"gy3": true,
			},
			NeedSources: 2,
			NeedTargets: 2,
		}},
	}}
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

// testStore holds Ozzy's deck, which builds the graveyard package, and Stevie's,
// which doesn't.
func testStore() storage.DeckStorage {
	return memory.NewStore(func(b *memory.Backend) {
		b.SeedPlayers(players.Player{ID: 1, Name: "Ozzy"}, players.Player{ID: 2, Name: "Stevie"})
		b.Seed("testcube", deck(1, "gy1", "gy2", "gy3"), deck(2, "gy1", "gy2", "Forest"))
	})
}

func staticPackages(string) ([]design.PackageCards, error) {
	return graveyardPackages(), nil
}

func playersOf(decks []*storage.Deck) []string {
	var out []string
	for _, d := range decks {
		out = append(out, d.Player)
	}
	return out
}

func TestDecksPackageFilters(t *testing.T) {
	q := New(testStore(), nil, staticPackages)
	decks, err := q.Decks("testcube", &storage.DecksRequest{Match: "package:graveyard"})
	require.NoError(t, err)
	assert.Equal(t, []string{"Ozzy"}, playersOf(decks))
}

func TestDecksNegatedPackage(t *testing.T) {
	q := New(testStore(), nil, staticPackages)
	decks, err := q.Decks("testcube", &storage.DecksRequest{Match: "package!=graveyard"})
	require.NoError(t, err)
	assert.Equal(t, []string{"Stevie"}, playersOf(decks))
}

func TestDecksSkipsLoaderWithoutPackage(t *testing.T) {
	calls := 0
	q := New(testStore(), nil, func(string) ([]design.PackageCards, error) {
		calls++
		return graveyardPackages(), nil
	})
	for _, match := range []string{"Package Deal", "arch:aggro"} {
		_, err := q.Decks("testcube", &storage.DecksRequest{Match: match})
		require.NoError(t, err)
	}
	assert.Equal(t, 0, calls)
}

func TestDecksLoaderErrorFails(t *testing.T) {
	q := New(testStore(), nil, func(string) ([]design.PackageCards, error) { return nil, errors.New("no rules") })
	_, err := q.Decks("testcube", &storage.DecksRequest{Match: "package:graveyard"})
	assert.ErrorContains(t, err, "no rules")
}

func TestDecksLeavesRequestUntouched(t *testing.T) {
	q := New(testStore(), nil, staticPackages)
	dr := &storage.DecksRequest{Match: "package:graveyard"}
	_, err := q.Decks("testcube", dr)
	require.NoError(t, err)
	assert.Nil(t, dr.Packages)
}

func TestDecksNilRequestListsAll(t *testing.T) {
	q := New(testStore(), nil, staticPackages)
	decks, err := q.Decks("testcube", nil)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"Ozzy", "Stevie"}, playersOf(decks))
}

func TestDecksLoaderErrorIsLogged(t *testing.T) {
	hook := logtest.NewGlobal()
	defer hook.Reset()
	q := New(testStore(), nil, func(string) ([]design.PackageCards, error) { return nil, errors.New("no rules") })

	_, err := q.Decks("testcube", &storage.DecksRequest{Match: "package:graveyard"})
	require.Error(t, err)
	require.NotNil(t, hook.LastEntry())
	assert.Equal(t, logrus.ErrorLevel, hook.LastEntry().Level)
	assert.ErrorContains(t, hook.LastEntry().Data[logrus.ErrorKey].(error), "no rules")
}
