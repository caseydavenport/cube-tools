package ocr

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestCardsHandler(t *testing.T) {
	root := t.TempDir()
	draftID := "2026-01-17_evt_1"
	// cube snapshot for the draft date: two of "Misty Rainforest", one "Brainstorm".
	writeFile(t, filepath.Join(root, "polyverse", "2026-01-17", "cube-snapshot.json"),
		`{"cards":[{"name":"Brainstorm"},{"name":"Misty Rainforest"},{"name":"Misty Rainforest"}]}`)

	h := CardsHandlerWithRoot(root)
	r := reqWithCube(t, "GET", "/api/polyverse/ocr/drafts/"+draftID+"/cards", "polyverse")
	r.SetPathValue("draft_id", draftID)
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
