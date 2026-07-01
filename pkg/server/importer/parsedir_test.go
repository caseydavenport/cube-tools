package importer

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestParseDirHandler(t *testing.T) {
	root := t.TempDir()
	writeTestCube(t, root, "polyverse", []string{"Monastery Mentor", "Snapcaster Mage"})

	deckDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(deckDir, "casey.txt"), []byte("1 Monastery Mentor\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(deckDir, "dom.txt"), []byte("1 Snapcaster Mage\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	body := ParseDirRequest{Dir: deckDir, Filetype: ".txt"}
	rw := postJSON(t, ParseDirHandlerWithRoot(root), "polyverse", "/api/polyverse/import/parse-dir", body)
	if rw.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rw.Code, rw.Body.String())
	}
	var resp ParseResponse
	if err := json.Unmarshal(rw.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Decks) != 2 {
		t.Fatalf("want 2 decks, got %d", len(resp.Decks))
	}
}

func TestParseDirHandlerMissingDir(t *testing.T) {
	root := t.TempDir()
	writeTestCube(t, root, "polyverse", []string{"Monastery Mentor"})
	body := ParseDirRequest{Dir: filepath.Join(t.TempDir(), "nope"), Filetype: ".txt"}
	rw := postJSON(t, ParseDirHandlerWithRoot(root), "polyverse", "/api/polyverse/import/parse-dir", body)
	if rw.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for missing dir, got %d", rw.Code)
	}
}
