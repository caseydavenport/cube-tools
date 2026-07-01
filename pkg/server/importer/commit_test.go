package importer

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestCommitHandlerWritesDraft(t *testing.T) {
	root := t.TempDir()
	writeTestCube(t, root, "polyverse", []string{"Monastery Mentor", "Snapcaster Mage"})

	body := CommitRequest{
		DraftID:   "2026-06-30_local_1",
		Date:      "2026-06-30",
		EventName: "Test Draft",
		Decks: []ParsedDeck{{
			Player:    "casey",
			Mainboard: []CountedCard{{Name: "Monastery Mentor", Count: 1}, {Name: "Plains", Count: 7}},
			Sideboard: []CountedCard{{Name: "Snapcaster Mage", Count: 1}},
		}},
	}
	rw := postJSON(t, CommitHandlerWithRoot(root), "polyverse", "/api/polyverse/import/commit", body)
	if rw.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rw.Code, rw.Body.String())
	}

	deckPath := filepath.Join(root, "polyverse", "2026-06-30_local_1", "casey.json")
	if _, err := os.Stat(deckPath); err != nil {
		t.Fatalf("deck file not written: %v", err)
	}
	metaBytes, err := os.ReadFile(filepath.Join(root, "polyverse", "2026-06-30_local_1", "metadata.json"))
	if err != nil {
		t.Fatal(err)
	}
	var meta types.DraftMetadata
	_ = json.Unmarshal(metaBytes, &meta)
	if meta.EventName != "Test Draft" || meta.DraftID != "2026-06-30_local_1" {
		t.Fatalf("bad metadata: %+v", meta)
	}
}

func TestCommitHandlerRejectsExistingDraft(t *testing.T) {
	root := t.TempDir()
	writeTestCube(t, root, "polyverse", []string{"Monastery Mentor"})
	existing := filepath.Join(root, "polyverse", "dupe")
	if err := os.MkdirAll(existing, 0o755); err != nil {
		t.Fatal(err)
	}
	body := CommitRequest{DraftID: "dupe", Date: "2026-06-30", Decks: []ParsedDeck{{Player: "casey"}}}
	rw := postJSON(t, CommitHandlerWithRoot(root), "polyverse", "/api/polyverse/import/commit", body)
	if rw.Code != http.StatusConflict {
		t.Fatalf("want 409 for existing draft, got %d", rw.Code)
	}
}

func TestCommitHandlerRejectsBadDraftID(t *testing.T) {
	root := t.TempDir()
	writeTestCube(t, root, "polyverse", []string{"Monastery Mentor"})
	body := CommitRequest{DraftID: "../escape", Date: "2026-06-30", Decks: []ParsedDeck{{Player: "casey"}}}
	rw := postJSON(t, CommitHandlerWithRoot(root), "polyverse", "/api/polyverse/import/commit", body)
	if rw.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for bad draft id, got %d", rw.Code)
	}
}
