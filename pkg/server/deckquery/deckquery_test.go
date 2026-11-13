package deckquery

import (
	"errors"
	"testing"

	"github.com/sirupsen/logrus"
	logtest "github.com/sirupsen/logrus/hooks/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// graveyardRules wires three graveyard cards to each other, so a deck
// holding all three builds the package and a deck holding two doesn't.
func graveyardRules() *design.DesignMapConfig {
	return &design.DesignMapConfig{
		Groups: []design.Group{{Name: "Graveyard cards", Conditions: []string{"n:gy1", "n:gy2", "n:gy3"}}},
		Packages: []design.Package{
			{Name: "Graveyard", Wires: []design.Wire{{Sources: []string{"Graveyard cards"}, Targets: []string{"Graveyard cards"}}}},
		},
	}
}

// graveyardCube is today's list: the three graveyard cards.
type graveyardCube struct{}

// Current returns the graveyard cards.
func (graveyardCube) Current(string) (*types.Cube, error) {
	return &types.Cube{Cards: []types.Card{{Name: "gy1"}, {Name: "gy2"}, {Name: "gy3"}}}, nil
}

// Refresh returns the graveyard cards.
func (c graveyardCube) Refresh(id string) (*types.Cube, error) {
	return c.Current(id)
}

// deck builds a deck in draft 1 for the player, with the named mainboard cards.
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
		b.SeedRules("testcube", graveyardRules())
		b.Seed("testcube", deck(1, "gy1", "gy2", "gy3"), deck(2, "gy1", "gy2", "Forest"))
	})
}

// rulesSpy counts rules reads, each one a rulebook load, and fails them all
// when err is set.
type rulesSpy struct {
	storage.DeckStorage
	reads int
	err   error
}

// GetRules counts the read and answers from the wrapped store, or fails.
func (s *rulesSpy) GetRules(cube string) (*design.DesignMapConfig, error) {
	s.reads++
	if s.err != nil {
		return nil, s.err
	}
	return s.DeckStorage.GetRules(cube)
}

func playersOf(decks []*storage.Deck) []string {
	var out []string
	for _, d := range decks {
		out = append(out, d.Player)
	}
	return out
}

func TestDecksPackageFilters(t *testing.T) {
	q := New(testStore(), graveyardCube{})
	decks, err := q.Decks("testcube", &storage.DecksRequest{Match: "package:graveyard"})
	require.NoError(t, err)
	assert.Equal(t, []string{"Ozzy"}, playersOf(decks))
}

func TestDecksNegatedPackage(t *testing.T) {
	q := New(testStore(), graveyardCube{})
	decks, err := q.Decks("testcube", &storage.DecksRequest{Match: "package!=graveyard"})
	require.NoError(t, err)
	assert.Equal(t, []string{"Stevie"}, playersOf(decks))
}

func TestDecksSkipsRulesWithoutPackage(t *testing.T) {
	spy := &rulesSpy{DeckStorage: testStore()}
	q := New(spy, graveyardCube{})
	for _, match := range []string{"Package Deal", "arch:aggro"} {
		_, err := q.Decks("testcube", &storage.DecksRequest{Match: match})
		require.NoError(t, err)
	}
	assert.Equal(t, 0, spy.reads)

	_, err := q.Decks("testcube", &storage.DecksRequest{Match: "package:graveyard"})
	require.NoError(t, err)
	assert.Equal(t, 1, spy.reads, "a package: term loads the rules")
}

func TestDecksInReusesRulebook(t *testing.T) {
	spy := &rulesSpy{DeckStorage: testStore()}
	rb, err := rulebook.Load(spy, graveyardCube{}, "testcube")
	require.NoError(t, err)
	q := New(spy, graveyardCube{})

	decks, err := q.DecksIn(rb, &storage.DecksRequest{Match: "package:graveyard"})
	require.NoError(t, err)
	assert.Equal(t, []string{"Ozzy"}, playersOf(decks))
	assert.Equal(t, 1, spy.reads, "only the caller's load read the rules")
}

func TestDecksRulesErrorFails(t *testing.T) {
	q := New(&rulesSpy{DeckStorage: testStore(), err: errors.New("no rules")}, graveyardCube{})
	_, err := q.Decks("testcube", &storage.DecksRequest{Match: "package:graveyard"})
	assert.ErrorContains(t, err, "no rules")
}

func TestDecksLeavesRequestUntouched(t *testing.T) {
	q := New(testStore(), graveyardCube{})
	dr := &storage.DecksRequest{Match: "package:graveyard"}
	_, err := q.Decks("testcube", dr)
	require.NoError(t, err)
	assert.Nil(t, dr.Packages)
}

func TestDecksNilRequestListsAll(t *testing.T) {
	q := New(testStore(), graveyardCube{})
	decks, err := q.Decks("testcube", nil)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"Ozzy", "Stevie"}, playersOf(decks))
}

func TestDecksRulesErrorIsLogged(t *testing.T) {
	hook := logtest.NewGlobal()
	defer hook.Reset()
	q := New(&rulesSpy{DeckStorage: testStore(), err: errors.New("no rules")}, graveyardCube{})

	_, err := q.Decks("testcube", &storage.DecksRequest{Match: "package:graveyard"})
	require.Error(t, err)
	require.NotNil(t, hook.LastEntry())
	assert.Equal(t, logrus.ErrorLevel, hook.LastEntry().Level)
	logged, ok := hook.LastEntry().Data[logrus.ErrorKey].(error)
	require.True(t, ok, "the log entry carries the error")
	assert.ErrorContains(t, logged, "no rules")
}
