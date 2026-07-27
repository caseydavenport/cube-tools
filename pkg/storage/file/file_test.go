package file

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
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

func TestFileRawDecksSetsID(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	b := New(nil)
	got, err := b.RawDecks("conf")
	assert.NoError(t, err)
	for _, d := range got {
		assert.Equal(t, d.Player, d.ID)
	}
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

func TestFileWriteDeckMetaRoundTripsOnDiskPath(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	b := New(nil)

	updated, err := b.WriteDeckMeta("conf", storage.DeckMetaWrite{DraftID: "d1", DeckID: "Alice", MacroArchetype: "Aggro", Labels: []string{"fast"}})
	assert.NoError(t, err)
	assert.Equal(t, "Aggro", updated.MacroArchetype)

	// The on-disk file must still carry its path; only the in-memory,
	// enriched copy returned to callers loses it.
	alicePath := filepath.Join(root, "data/conf/d1/alice.json")
	contents, err := os.ReadFile(alicePath)
	assert.NoError(t, err)
	assert.Contains(t, string(contents), `"path": "data/conf/d1/alice.json"`)
}

// writeConfFixture writes a throwaway "conf" cube under root/data, matching
// the canonical conformance dataset: draft "d1" with Alice (2-0 vs Bob) and
// Bob (0-2 vs Alice).
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
 "labels": [],
 "player": "Alice",
 "date": "2024-01-01",
 "matches": [{"opponent": "Bob", "wins": 2, "losses": 0}],
 "mainboard": [],
 "sideboard": []
}`
	if err := os.WriteFile(filepath.Join(root, alicePath), []byte(alice), 0o644); err != nil {
		t.Fatalf("write alice.json: %v", err)
	}

	bob := `{
 "metadata": {"path": "` + bobPath + `", "draft_id": "d1"},
 "labels": [],
 "player": "Bob",
 "date": "2024-01-01",
 "matches": [{"opponent": "Alice", "wins": 0, "losses": 2}],
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

func TestFileNotesRoundTrip(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	b := New(nil)

	err := b.PutNotes("conf", "d1", "Alice", "great deck")
	assert.NoError(t, err)

	got, err := b.GetNotes("conf", "d1", "Alice")
	assert.NoError(t, err)
	assert.Equal(t, "great deck", got)

	// Path is lowercased end-to-end, matching today's client convention.
	contents, err := os.ReadFile(filepath.Join(root, "data/conf/d1/alice.report.md"))
	assert.NoError(t, err)
	assert.Equal(t, "great deck", string(contents))
}

func TestFileNotesMissingReturnsEmpty(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	b := New(nil)

	got, err := b.GetNotes("conf", "d1", "Nobody")
	assert.NoError(t, err)
	assert.Equal(t, "", got)
}

func TestFileNotesRejectsPathEscape(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	b := New(nil)

	_, err := b.GetNotes("conf", "../escape", "Alice")
	assert.Error(t, err)

	err = b.PutNotes("conf", "d1", "../escape", "x")
	assert.Error(t, err)
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
	assert.ElementsMatch(t, []storage.IndexedDeck{{ID: "Alice"}, {ID: "Bob"}}, draft.Decks)
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
