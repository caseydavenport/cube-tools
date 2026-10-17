package file

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func TestFileBackend_ListPolyverse(t *testing.T) {
	if _, err := os.Stat("data/polyverse/index.json"); err != nil {
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
	ids := map[string]int{}
	for _, d := range got {
		ids[d.Player] = d.ID
	}
	assert.Equal(t, map[string]int{
		"Alice": 1,
		"Bob":   2,
	}, ids)
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
	s := storage.NewStore(New(nil))

	_, err := s.SaveDeckRecord("conf", storage.RecordEdit{DraftID: "d1", DeckID: 1, Player: "casey"})
	assert.NoError(t, err)

	alice, err := types.LoadDeck(filepath.Join(root, "data/conf/d1/alice.json"))
	assert.NoError(t, err)
	assert.Equal(t, "casey", alice.Player)
	assert.Equal(t, 1, alice.ID)
	assert.Equal(t, "data/conf/d1/alice.json", alice.Metadata.Path)

	files, err := filepath.Glob(filepath.Join(root, "data/conf/d1/*.json"))
	assert.NoError(t, err)
	assert.Len(t, files, 2)
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
	assert.ErrorIs(t, b.SaveDecks("conf", "d1", []*storage.Deck{d}), storage.ErrDeckNotFound)
	assert.Error(t, b.SaveDecks("conf", "../escape", []*storage.Deck{d}))
	_, err := b.LoadDraft("conf", "missing")
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
			bobPath := filepath.Join(root, "data/conf/d1/bob.json")
			raw, err := os.ReadFile(bobPath)
			assert.NoError(t, err)
			assert.NoError(t, os.WriteFile(bobPath, []byte(strings.Replace(string(raw), `"id": 2,`, bobID, 1)), 0o644))
			b := New(nil)

			_, err = b.LoadDraft("conf", "d1")
			assert.ErrorContains(t, err, "bob.json")

			alice := &storage.Deck{}
			alice.ID = 1
			alice.Player = "overwritten"
			assert.Error(t, b.SaveDecks("conf", "d1", []*storage.Deck{alice}))
			after, err := os.ReadFile(bobPath)
			assert.NoError(t, err)
			assert.NotContains(t, string(after), "overwritten")
		})
	}
}

func TestFileClearedColorOverrideIsAbsentOnDisk(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	s := storage.NewStore(New(nil))

	_, err := s.UpdateDeckMeta("conf", storage.DeckMetaWrite{DraftID: "d1", DeckID: 1, Colors: []string{"R"}})
	assert.NoError(t, err)
	_, err = s.UpdateDeckMeta("conf", storage.DeckMetaWrite{DraftID: "d1", DeckID: 1, Colors: []string{}})
	assert.NoError(t, err)

	raw, err := os.ReadFile(filepath.Join(root, "data/conf/d1/alice.json"))
	assert.NoError(t, err)
	var onDisk map[string]any
	assert.NoError(t, json.Unmarshal(raw, &onDisk))
	_, present := onDisk["colors"]
	assert.False(t, present, "cleared color override should be absent on disk")
}

// writeConfFixture writes a throwaway "conf" cube under root/data, matching
// the canonical conformance dataset: draft "d1" with Alice (id 1, 2-0 vs Bob in
// round 1, two games) and Bob (id 2, the mirror).
func writeConfFixture(t *testing.T, root string) {
	t.Helper()

	cubeDir := filepath.Join(root, "data", "conf")
	draftDir := filepath.Join(cubeDir, "d1")
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		t.Fatalf("mkdir draft dir: %v", err)
	}

	alicePath := "data/conf/d1/alice.json"
	bobPath := "data/conf/d1/bob.json"

	index := `{
 "drafts": [
  {
   "path": "data/conf/d1",
   "date": "2024-01-01",
   "draft_id": "d1",
   "decks": [
    {"path": "` + alicePath + `"},
    {"path": "` + bobPath + `"}
   ]
  }
 ]
}`
	if err := os.WriteFile(filepath.Join(cubeDir, "index.json"), []byte(index), 0o644); err != nil {
		t.Fatalf("write index.json: %v", err)
	}

	alice := `{
 "metadata": {"path": "` + alicePath + `", "draft_id": "d1"},
 "id": 1,
 "labels": [],
 "player": "Alice",
 "date": "2024-01-01",
 "matches": [{"opponent": "Bob", "opponent_id": 2, "round": 1, "wins": 2, "losses": 0, "winner": "Alice",
   "games": [{"opponent": "Bob", "winner": "Alice"}, {"opponent": "Bob", "winner": "Alice"}]}],
 "mainboard": [],
 "sideboard": []
}`
	if err := os.WriteFile(filepath.Join(root, alicePath), []byte(alice), 0o644); err != nil {
		t.Fatalf("write alice.json: %v", err)
	}

	bob := `{
 "metadata": {"path": "` + bobPath + `", "draft_id": "d1"},
 "id": 2,
 "labels": [],
 "player": "Bob",
 "date": "2024-01-01",
 "matches": [{"opponent": "Alice", "opponent_id": 1, "round": 1, "wins": 0, "losses": 2, "winner": "Alice",
   "games": [{"opponent": "Alice", "winner": "Alice"}, {"opponent": "Alice", "winner": "Alice"}]}],
 "mainboard": [],
 "sideboard": []
}`
	if err := os.WriteFile(filepath.Join(root, bobPath), []byte(bob), 0o644); err != nil {
		t.Fatalf("write bob.json: %v", err)
	}
}

// writeConfDraftLog extends the conf fixture with a draft log: it points
// index.json at "d1"'s draft-log.json and writes that file, matching what
// commands.Index produces once a draft has been logged.
func writeConfDraftLog(t *testing.T, root string) {
	t.Helper()

	index := `{
 "drafts": [
  {
   "path": "data/conf/d1",
   "date": "2024-01-01",
   "draft_id": "d1",
   "draft_log": "data/conf/d1/draft-log.json",
   "decks": [
    {"path": "data/conf/d1/alice.json"},
    {"path": "data/conf/d1/bob.json"}
   ]
  }
 ]
}`
	if err := os.WriteFile(filepath.Join(root, "data/conf/index.json"), []byte(index), 0o644); err != nil {
		t.Fatalf("write index.json: %v", err)
	}

	logPath := filepath.Join(root, "data/conf/d1/draft-log.json")
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
	assert.Equal(t, "d1", draft.DraftID)
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
	got, err := b.GetDraftLog("conf", "d1")
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
	_, err := b.GetDraftLog("conf", "d1")
	assert.ErrorIs(t, err, storage.ErrDeckNotFound)
}
