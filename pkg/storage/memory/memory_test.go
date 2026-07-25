package memory

import (
	"encoding/json"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func deck(player, draft string, matches []types.Match) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draft
	d.Date = "2024-01-01"
	d.Matches = matches
	return d
}

func TestMemoryConformance(t *testing.T) {
	b := New()
	b.Seed("conf",
		deck("Alice", "d1", []types.Match{{Opponent: "Bob", Wins: 2, Losses: 0}}),
		deck("Bob", "d1", []types.Match{{Opponent: "Alice", Wins: 0, Losses: 2}}),
	)
	b.SeedIndex("conf", &storage.CubeIndex{
		Drafts: []storage.IndexedDraft{
			{
				DraftID: "d1",
				Date:    "2024-01-01",
				HasLog:  true,
				Decks:   []storage.IndexedDeck{{ID: "Alice"}, {ID: "Bob"}},
			},
		},
	})
	b.SeedDraftLog("conf", "d1", json.RawMessage(`{"picks":[]}`))
	s := storage.NewStore(b)
	storage.RunDeckConformance(t, s, storage.Detect(b))
}

func TestMemoryRawDecksSetsID(t *testing.T) {
	b := New()
	b.Seed("c", deck("Alice", "d1", nil))
	got, err := b.RawDecks("c")
	assert.NoError(t, err)
	assert.Equal(t, "Alice", got[0].ID)
}

func TestMemoryBackend_UpdateRoundTrips(t *testing.T) {
	b := New()
	b.Seed("cubeA",
		deck("Alice", "d1", []types.Match{{Opponent: "Bob", Wins: 2, Losses: 0}}),
		deck("Bob", "d1", []types.Match{{Opponent: "Alice", Wins: 0, Losses: 2}}),
	)
	s := storage.NewStore(b)

	_, err := s.UpdateDeckMeta("cubeA", "d1", "Alice", "Aggro", []string{"fast"}, []string{"R"})
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

func TestMemoryNotesRoundTrip(t *testing.T) {
	b := New()
	err := b.PutNotes("conf", "d1", "Alice", "great deck")
	assert.NoError(t, err)

	got, err := b.GetNotes("conf", "d1", "Alice")
	assert.NoError(t, err)
	assert.Equal(t, "great deck", got)
}

func TestMemoryNotesMissingReturnsEmpty(t *testing.T) {
	b := New()
	got, err := b.GetNotes("conf", "d1", "Nobody")
	assert.NoError(t, err)
	assert.Equal(t, "", got)
}

func TestMemoryNotesSeed(t *testing.T) {
	b := New()
	b.SeedNotes("conf", "d1", "Alice", "seeded notes")

	got, err := b.GetNotes("conf", "d1", "Alice")
	assert.NoError(t, err)
	assert.Equal(t, "seeded notes", got)
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
			{DraftID: "d1", Date: "2024-01-01", HasLog: true, Decks: []storage.IndexedDeck{{ID: "Alice"}}},
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
	b.SeedDraftLog("conf", "d1", log)

	got, err := b.GetDraftLog("conf", "d1")
	assert.NoError(t, err)
	assert.Equal(t, log, got)
}

func TestMemoryGetDraftLogMissing(t *testing.T) {
	b := New()
	_, err := b.GetDraftLog("conf", "d1")
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}
