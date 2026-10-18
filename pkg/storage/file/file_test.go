package file

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func TestFileBackend_ListPolyverse(t *testing.T) {
	if _, err := os.Stat("data/polyverse"); err != nil {
		if err := os.Chdir("../../.."); err != nil {
			t.Fatalf("chdir to repo root: %v", err)
		}
	}
	s := NewStore(nil)
	decks, err := s.List("polyverse", nil)
	assert.NoError(t, err)
	assert.NotEmpty(t, decks)
	var _ *storage.Store = s
}

func TestFileRawDecksReadsIDFromFile(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	b := New(nil)
	got, err := b.RawDecks("conf")
	assert.NoError(t, err)
	deckIDByPlayer := map[int]int{}
	for _, d := range got {
		deckIDByPlayer[d.PlayerID] = d.ID
	}
	assert.Equal(t, map[int]int{
		1: 1,
		2: 2,
	}, deckIDByPlayer)
}

func TestFileConformance(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	writeConfDraftLog(t, root)
	s := NewStore(nil)
	storage.RunDeckConformance(t, s, storage.Detect(New(nil)))
}

func TestFileRawDecksBlanksPath(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	b := New(nil)
	got, err := b.RawDecks("conf")
	assert.NoError(t, err)
	assert.NotEmpty(t, got)
	for _, d := range got {
		assert.Empty(t, d.Metadata.Path)
	}
}

func TestFileSaveDecksKeepsFileAndPath(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	s := NewStore(nil)

	carol := 3
	_, err := s.SaveDeckRecord("conf", storage.RecordEdit{DraftID: 1, DeckID: 1, PlayerID: &carol})
	assert.NoError(t, err)

	alice, err := types.LoadDeck(filepath.Join(root, "data/conf/0001_2024-01-01/alice.json"))
	assert.NoError(t, err)
	assert.Equal(t, 3, alice.PlayerID)
	assert.Equal(t, 1, alice.ID)
	assert.Equal(t, "data/conf/0001_2024-01-01/alice.json", alice.Metadata.Path)

	draft, err := drafts.Find(filepath.Join(root, "data/conf"), 1)
	assert.NoError(t, err)
	decks, err := draft.Decks()
	assert.NoError(t, err)
	assert.Len(t, decks, 2)
}

func TestFileSaveDecksUnknownID(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	b := New(nil)

	d := &storage.Deck{}
	d.ID = 9
	assert.ErrorIs(t, b.SaveDecks("conf", 1, []*storage.Deck{d}), storage.ErrDeckNotFound)
	assert.ErrorIs(t, b.SaveDecks("conf", 99, []*storage.Deck{d}), storage.ErrDeckNotFound)
	_, err := b.LoadDraft("conf", 99)
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}

func TestFileRefusesDraftWithDuplicateOrMissingIDs(t *testing.T) {
	for name, bobID := range map[string]string{
		"duplicate": `"id": 1,`,
		"missing":   ``,
	} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			t.Chdir(root)
			writeConfFixture(t, root)
			bobPath := filepath.Join(root, "data/conf/0001_2024-01-01/bob.json")
			raw, err := os.ReadFile(bobPath)
			assert.NoError(t, err)
			assert.NoError(t, os.WriteFile(bobPath, []byte(strings.Replace(string(raw), `"id": 2,`, bobID, 1)), 0o644))
			b := New(nil)

			_, err = b.LoadDraft("conf", 1)
			assert.ErrorContains(t, err, "bob.json")

			alice := &storage.Deck{}
			alice.ID = 1
			alice.Notes = "overwritten"
			assert.Error(t, b.SaveDecks("conf", 1, []*storage.Deck{alice}))
			after, err := os.ReadFile(bobPath)
			assert.NoError(t, err)
			assert.NotContains(t, string(after), "overwritten")
		})
	}
}

func TestFileRawDecksCarryDraftInfo(t *testing.T) {
	root := t.TempDir()
	t.Chdir(root)
	writeConfFixture(t, root)

	got, err := New(nil).RawDecks("conf")
	assert.NoError(t, err)
	assert.NotEmpty(t, got)
	for _, d := range got {
		assert.Equal(t, storage.DraftInfo{ID: 1, Date: "2024-01-01", EventName: "Conf", EventCode: "local"}, d.Draft)
	}
}

func TestFileClearedColorOverrideIsAbsentOnDisk(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	s := NewStore(nil)

	_, err := s.UpdateDeckMeta("conf", storage.DeckMetaWrite{DraftID: 1, DeckID: 1, Colors: []string{"R"}})
	assert.NoError(t, err)
	_, err = s.UpdateDeckMeta("conf", storage.DeckMetaWrite{DraftID: 1, DeckID: 1, Colors: []string{}})
	assert.NoError(t, err)

	raw, err := os.ReadFile(filepath.Join(root, "data/conf/0001_2024-01-01/alice.json"))
	assert.NoError(t, err)
	var onDisk map[string]any
	assert.NoError(t, json.Unmarshal(raw, &onDisk))
	_, present := onDisk["colors"]
	assert.False(t, present, "cleared color override should be absent on disk")
}

// writeConfFixture writes a throwaway "conf" cube under root/data, matching
// the canonical conformance dataset: players Alice (1), Bob (2) and Carol (3),
// and draft 1 with Alice's deck (id 1, 2-0 vs Bob in round 1, two games) and
// Bob's (id 2, the mirror).
func writeConfFixture(t *testing.T, root string) {
	t.Helper()

	roster := `{"players": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}, {"id": 3, "name": "Carol"}]}`
	if err := os.MkdirAll(filepath.Join(root, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "data", players.Filename), []byte(roster), 0o644); err != nil {
		t.Fatalf("write players.json: %v", err)
	}

	cubeDir := filepath.Join(root, "data", "conf")
	draftDir := filepath.Join(cubeDir, "0001_2024-01-01")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatalf("mkdir draft dir: %v", err)
	}
	meta := types.DraftMetadata{ID: 1, Date: "2024-01-01", EventName: "Conf", EventCode: "local"}
	if err := (drafts.Draft{Dir: draftDir, DraftMetadata: meta}).SaveMetadata(); err != nil {
		t.Fatalf("write draft metadata: %v", err)
	}

	alicePath := "data/conf/0001_2024-01-01/alice.json"
	bobPath := "data/conf/0001_2024-01-01/bob.json"

	alice := `{
 "metadata": {"path": "` + alicePath + `", "draft_id": 1},
 "id": 1,
 "labels": [],
 "player_id": 1,
 "date": "2024-01-01",
 "matches": [{"opponent_id": 2, "round": 1, "wins": 2, "losses": 0, "draws": 0,
   "games": [{"won": true}, {"won": true}]}],
 "mainboard": [],
 "sideboard": []
}`
	if err := os.WriteFile(filepath.Join(root, alicePath), []byte(alice), 0o644); err != nil {
		t.Fatalf("write alice.json: %v", err)
	}

	bob := `{
 "metadata": {"path": "` + bobPath + `", "draft_id": 1},
 "id": 2,
 "labels": [],
 "player_id": 2,
 "date": "2024-01-01",
 "matches": [{"opponent_id": 1, "round": 1, "wins": 0, "losses": 2, "draws": 0,
   "games": [{}, {}]}],
 "mainboard": [],
 "sideboard": []
}`
	if err := os.WriteFile(filepath.Join(root, bobPath), []byte(bob), 0o644); err != nil {
		t.Fatalf("write bob.json: %v", err)
	}
}

// writeConfDraftLog extends the conf fixture with a draft log for draft 1.
func writeConfDraftLog(t *testing.T, root string) {
	t.Helper()

	logPath := filepath.Join(root, "data/conf/0001_2024-01-01/draft-log.json")
	if err := os.WriteFile(logPath, []byte(`{"picks":[]}`), 0o644); err != nil {
		t.Fatalf("write draft-log.json: %v", err)
	}
}

func TestFileRulesRoundTrip(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	b := New(nil)

	rules := &design.DesignMapConfig{
		Groups: []design.Group{{Name: "Aggro"}},
	}
	assert.NoError(t, b.PutRules("conf", rules))

	got, err := b.GetRules("conf")
	assert.NoError(t, err)
	assert.Equal(t, rules, got)
}

func TestFileIndex(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	writeConfDraftLog(t, root)

	b := New(nil)
	got, err := b.Index("conf")
	assert.NoError(t, err)
	assert.Len(t, got.Drafts, 1)
	draft := got.Drafts[0]
	assert.Equal(t, 1, draft.ID)
	assert.Equal(t, "2024-01-01", draft.Date)
	assert.True(t, draft.HasLog)
	assert.ElementsMatch(t, []storage.IndexedDeck{{ID: 1}, {ID: 2}}, draft.Decks)
}

func TestFileGetDraftLog(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	writeConfDraftLog(t, root)

	b := New(nil)
	got, err := b.GetDraftLog("conf", 1)
	assert.NoError(t, err)
	assert.JSONEq(t, `{"picks":[]}`, string(got))
}

func TestFileGetDraftLogMissing(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)

	b := New(nil)
	_, err := b.GetDraftLog("conf", 1)
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}

func TestFileIndexEmptyCube(t *testing.T) {
	t.Chdir(t.TempDir())

	got, err := New(nil).Index("empty")
	assert.NoError(t, err)
	encoded, err := json.Marshal(got)
	assert.NoError(t, err)
	assert.JSONEq(t, `{"drafts":[]}`, string(encoded))
}

func TestFileRawDecksSeesNewDeckWithoutReindex(t *testing.T) {
	root := t.TempDir()
	t.Chdir(root)
	writeConfFixture(t, root)
	b := New(nil)

	draft, err := drafts.Find(filepath.Join(root, "data/conf"), 1)
	assert.NoError(t, err)
	deck := types.NewDeck()
	deck.ID = 3
	assert.NoError(t, draft.SaveDeck(deck))

	got, err := b.RawDecks("conf")
	assert.NoError(t, err)
	assert.Len(t, got, 3)
}
