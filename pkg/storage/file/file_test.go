package file

import (
	"os"
	"path/filepath"
	"testing"

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

func TestFileConformance(t *testing.T) {
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir temp root: %v", err)
	}
	writeConfFixture(t, root)
	s := NewStore(nil)
	storage.RunDeckConformance(t, s, storage.Detect(New(nil)))
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
