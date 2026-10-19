package ocr

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestCardsHandler(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})

	// The draft's cube snapshot: two of "Misty Rainforest", one "Brainstorm".
	writeFile(t, filepath.Join(d.Dir, "cube-snapshot.json"), `{"cards":[{"name":"Brainstorm"},{"name":"Misty Rainforest"},{"name":"Misty Rainforest"}]}`)

	h := CardsHandler(root)
	r := draftReq(t, "GET", "/cards", d)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
	var out struct {
		Cards []CardInfo `json:"cards"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	caps := map[string]int{}
	for _, c := range out.Cards {
		caps[c.Name] = c.MaxCopies
	}
	if caps["Misty Rainforest"] != 2 || caps["Brainstorm"] != 1 {
		t.Fatalf("caps = %+v", caps)
	}
}

func TestLoadCubeForDraftUsesDraftSnapshot(t *testing.T) {
	root := t.TempDir()
	first := newDraft(t, root, types.DraftMetadata{})
	writeFile(t, filepath.Join(first.Dir, "cube-snapshot.json"), `{"cards":[{"name":"Brainstorm"}]}`)
	latest := newDraft(t, root, types.DraftMetadata{Date: "2026-02-01"})
	writeFile(t, filepath.Join(latest.Dir, "cube-snapshot.json"), `{"cards":[{"name":"Ponder"}]}`)

	cl, err := loadCubeForDraft(root, "polyverse", first)
	if err != nil {
		t.Fatal(err)
	}
	if names := cl.Names(); len(names) != 1 || names[0] != "Brainstorm" {
		t.Fatalf("cube for draft 1 = %v, want its own snapshot [Brainstorm]", names)
	}
}
