package memory

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestMemoryConformance(t *testing.T) {
	b := New()
	SeedConformance(b)
	b.SetReadOnly("ro")
	storage.RunConformance(t, storage.NewStore(b, storage.WithPlayers(b)), "ro")
}

func TestMemorySeedNumbersDecksPerDraft(t *testing.T) {
	b := New()
	b.Seed("c", seedDeck("Freddie", 1, nil), seedDeck("Joan", 1, nil), seedDeck("Freddie", 2, nil))
	got, err := b.RawDecks("c")
	assert.NoError(t, err)
	deckIDByDraftAndPlayer := map[string]int{}
	for _, d := range got {
		deckIDByDraftAndPlayer[fmt.Sprintf("%d/%s", d.Metadata.DraftID, d.Player)] = d.ID
	}
	assert.Equal(t, map[string]int{
		"1/Freddie": 1,
		"1/Joan":    2,
		"2/Freddie": 1,
	}, deckIDByDraftAndPlayer)
}

func TestMemorySaveDecksUnknownDeck(t *testing.T) {
	b := New()
	b.Seed("c", seedDeck("Freddie", 1, nil))

	missing := &storage.Deck{}
	missing.ID = 9
	assert.ErrorIs(t, b.SaveDecks("c", 1, []*storage.Deck{missing}), storage.ErrDeckNotFound)

	otherDraft := &storage.Deck{}
	otherDraft.ID = 1
	assert.ErrorIs(t, b.SaveDecks("c", 2, []*storage.Deck{otherDraft}), storage.ErrDeckNotFound)
}

func TestMemoryCreateDraftNumbersAfterHighest(t *testing.T) {
	b := New()
	b.Seed("c", seedDeck("Freddie", 3, nil))

	id, err := b.CreateDraft("c", types.DraftMetadata{Date: "2024-02-01"}, &types.Cube{}, []*storage.Deck{{}})
	assert.NoError(t, err)
	assert.Equal(t, 4, id)

	otherCube, err := b.CreateDraft("other", types.DraftMetadata{}, &types.Cube{}, []*storage.Deck{{}})
	assert.NoError(t, err)
	assert.Equal(t, 1, otherCube)
}

func TestMemorySetReadOnlyScopedToCube(t *testing.T) {
	b := New()
	b.SetReadOnly("ro")

	assert.False(t, b.Writable("ro"))
	assert.True(t, b.Writable("rw"))
}

func TestMemoryLoadDraftReturnsCopies(t *testing.T) {
	b := New()
	b.Seed("c", seedDeck("Freddie", 1, nil))
	got, err := b.LoadDraft("c", 1)
	assert.NoError(t, err)
	got[0].Player = "changed"

	again, err := b.LoadDraft("c", 1)
	assert.NoError(t, err)
	assert.Equal(t, "Freddie", again[0].Player)

	_, err = b.LoadDraft("c", 99)
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}

func TestMemoryBackend_UpdateRoundTrips(t *testing.T) {
	b := New()
	freddieDeck := seedDeck("Freddie", 1, []types.Match{{Opponent: "Joan", Wins: 2, Losses: 0}})
	joanDeck := seedDeck("Joan", 1, []types.Match{{Opponent: "Freddie", Wins: 0, Losses: 2}})
	b.Seed("cubeA", freddieDeck, joanDeck)
	s := storage.NewStore(b)

	_, err := s.UpdateDeckMeta("cubeA", storage.DeckMetaWrite{
		DraftID: 1, DeckID: 1, MacroArchetype: "Aggro", Labels: []string{"fast"}, Colors: []string{"R"},
	})
	assert.NoError(t, err)

	got, err := s.List("cubeA", nil)
	assert.NoError(t, err)
	var freddie *storage.Deck
	for _, d := range got {
		if d.Player == "Freddie" {
			freddie = d
		}
	}
	assert.NotNil(t, freddie)
	assert.Equal(t, "Aggro", freddie.MacroArchetype)
	assert.Equal(t, []string{"fast"}, freddie.Labels)
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

func TestMemoryGetSnapshotRoundTrip(t *testing.T) {
	b := New()
	snap := &types.Cube{Cards: []types.Card{{Name: "Lightning Bolt"}}}
	b.SeedSnapshot("conf", 1, snap)

	got, err := b.GetSnapshot("conf", 1)
	assert.NoError(t, err)
	assert.Equal(t, snap, got)
}

func TestMemoryGetSnapshotMissing(t *testing.T) {
	_, err := New().GetSnapshot("conf", 1)
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}
