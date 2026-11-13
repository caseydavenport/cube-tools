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
	draft := newDraft(t, root, types.DraftMetadata{})

	// The draft's cube snapshot: two of "Misty Rainforest", one "Brainstorm".
	writeFile(t, filepath.Join(draft.Dir, "cube-snapshot.json"), `{"cards":[{"name":"Brainstorm"},{"name":"Misty Rainforest"},{"name":"Misty Rainforest"}]}`)

	h := CardsHandler(root)
	r := draftReq(t, "GET", "/cards", draft)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
	var out cardsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	numMaxCopiesByName := map[string]int{}
	for _, card := range out.Cards {
		numMaxCopiesByName[card.Name] = card.MaxCopies
	}
	if numMaxCopiesByName["Misty Rainforest"] != 2 || numMaxCopiesByName["Brainstorm"] != 1 {
		t.Fatalf("max copies = %+v", numMaxCopiesByName)
	}
}
