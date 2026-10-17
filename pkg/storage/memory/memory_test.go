package memory

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func deck(player string, draft int, matches []types.Match) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draft
	d.Date = "2024-01-01"
	d.Matches = matches
	return d
}

func TestMemoryConformance(t *testing.T) {
	b := New()
	b.SeedPlayers(players.Player{ID: 1, Name: "Alice"}, players.Player{ID: 2, Name: "Bob"}, players.Player{ID: 3, Name: "Carol"})
	alice := deck("", 1, []types.Match{{
		Opponent: "Bob", OpponentID: 2, Round: 1, Wins: 2, Losses: 0, Winner: "Alice",
		Games: []types.Game{{Won: true}, {Won: true}},
	}})
	alice.PlayerID = 1
	bob := deck("", 1, []types.Match{{
		Opponent: "Alice", OpponentID: 1, Round: 1, Wins: 0, Losses: 2, Winner: "Alice",
		Games: []types.Game{{}, {}},
	}})
	bob.PlayerID = 2
	b.Seed("conf", alice, bob)
	b.SeedIndex("conf", &storage.CubeIndex{
		Drafts: []storage.IndexedDraft{
			{
				DraftInfo: storage.DraftInfo{ID: 1, Date: "2024-01-01"},
				HasLog:    true,
				Decks:     []storage.IndexedDeck{{ID: 1}, {ID: 2}},
			},
		},
	})
	b.SeedDraftLog("conf", 1, json.RawMessage(`{"picks":[]}`))
	s := storage.NewStore(b, storage.WithPlayers(b))
	storage.RunDeckConformance(t, s, storage.Detect(b))
}

func TestMemorySeedNumbersDecksPerDraft(t *testing.T) {
	b := New()
	b.Seed("c", deck("Alice", 1, nil), deck("Bob", 1, nil), deck("Alice", 2, nil))
	got, err := b.RawDecks("c")
	assert.NoError(t, err)
	ids := map[string]int{}
	for _, d := range got {
		ids[fmt.Sprintf("%d/%s", d.Metadata.DraftID, d.Player)] = d.ID
	}
	assert.Equal(t, map[string]int{
		"1/Alice": 1,
		"1/Bob":   2,
		"2/Alice": 1,
	}, ids)
}

func TestMemoryLoadDraftReturnsCopies(t *testing.T) {
	b := New()
	b.Seed("c", deck("Alice", 1, nil))
	got, err := b.LoadDraft("c", 1)
	assert.NoError(t, err)
	got[0].Player = "changed"

	again, err := b.LoadDraft("c", 1)
	assert.NoError(t, err)
	assert.Equal(t, "Alice", again[0].Player)

	_, err = b.LoadDraft("c", 99)
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}

func TestMemoryBackend_UpdateRoundTrips(t *testing.T) {
	b := New()
	b.Seed("cubeA",
		deck("Alice", 1, []types.Match{{Opponent: "Bob", Wins: 2, Losses: 0}}),
		deck("Bob", 1, []types.Match{{Opponent: "Alice", Wins: 0, Losses: 2}}),
	)
	s := storage.NewStore(b)

	_, err := s.UpdateDeckMeta("cubeA", storage.DeckMetaWrite{
		DraftID: 1, DeckID: 1, MacroArchetype: "Aggro", Labels: []string{"fast"}, Colors: []string{"R"},
	})
	assert.NoError(t, err)

	got, err := s.List("cubeA", nil)
	assert.NoError(t, err)
	var alice *storage.Deck
	for _, d := range got {
		if d.Player == "Alice" {
			alice = d
		}
	}
	assert.NotNil(t, alice)
	assert.Equal(t, "Aggro", alice.MacroArchetype)
	assert.Equal(t, []string{"fast"}, alice.Labels)
}

func TestMemoryRulesRoundTrip(t *testing.T) {
	b := New()
	rules := &design.DesignMapConfig{}
	assert.NoError(t, b.PutRules("conf", rules))

	got, err := b.GetRules("conf")
	assert.NoError(t, err)
	assert.Equal(t, rules, got)
}

func TestMemoryRulesMissing(t *testing.T) {
	b := New()
	_, err := b.GetRules("conf")
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}

func TestMemoryRulesSeed(t *testing.T) {
	b := New()
	rules := &design.DesignMapConfig{}
	b.SeedRules("conf", rules)

	got, err := b.GetRules("conf")
	assert.NoError(t, err)
	assert.Equal(t, rules, got)
}

func TestMemoryIndexRoundTrip(t *testing.T) {
	b := New()
	idx := &storage.CubeIndex{
		Drafts: []storage.IndexedDraft{
			{DraftInfo: storage.DraftInfo{ID: 1, Date: "2024-01-01"}, HasLog: true, Decks: []storage.IndexedDeck{{ID: 1}}},
		},
	}
	b.SeedIndex("conf", idx)

	got, err := b.Index("conf")
	assert.NoError(t, err)
	assert.Equal(t, idx, got)
}

func TestMemoryIndexMissing(t *testing.T) {
	b := New()
	_, err := b.Index("conf")
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}

func TestMemoryGetDraftLogRoundTrip(t *testing.T) {
	b := New()
	log := json.RawMessage(`{"picks":[]}`)
	b.SeedDraftLog("conf", 1, log)

	got, err := b.GetDraftLog("conf", 1)
	assert.NoError(t, err)
	assert.Equal(t, log, got)
}

func TestMemoryGetDraftLogMissing(t *testing.T) {
	b := New()
	_, err := b.GetDraftLog("conf", 1)
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}
