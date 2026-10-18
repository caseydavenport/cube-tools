package ocr

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestDiscoverPlayers(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})
	writeFile(t, filepath.Join(d.Dir, "img", "p3", "checkin-1.jpg"), "x")
	writeFile(t, filepath.Join(d.Dir, "img", "p3", "checkin-2.jpg"), "x")
	writeFile(t, filepath.Join(d.Dir, "img", "p3", "deck-1.jpg"), "x")

	// A deck with no cards yet, as import-hedron leaves it.
	deck := types.NewDeck()
	deck.ID = 3
	deck.PlayerID = 7
	deck.Matches = []types.Match{{OpponentID: 5, Wins: 2, Losses: 1}}
	writeDeck(t, d, deck)

	players, err := discoverPlayers(d)
	if err != nil {
		t.Fatal(err)
	}
	if len(players) != 1 {
		t.Fatalf("players = %d, want 1", len(players))
	}
	p := players[0]
	if p.ID != "p3" {
		t.Fatalf("id = %q, want p3", p.ID)
	}
	if len(p.Photos.Checkin) != 2 || len(p.Photos.Deck) != 1 {
		t.Fatalf("photos = %+v", p.Photos)
	}
	if p.Photos.Checkin[0] != "img/p3/checkin-1.jpg" {
		t.Fatalf("checkin[0] = %q, want a path relative to the draft", p.Photos.Checkin[0])
	}
	if p.HasDeck {
		t.Fatalf("HasDeck should be false for empty deck")
	}
	if len(p.Matches) != 1 {
		t.Fatalf("matches = %d, want 1", len(p.Matches))
	}
	if p.PlayerID != 7 {
		t.Fatalf("player id = %d, want 7", p.PlayerID)
	}
}

func TestDraftDetailHandler(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{EventName: "Friday Night"})
	writeFile(t, filepath.Join(d.Dir, "img", "p3", "checkin-1.jpg"), "x")

	mux := http.NewServeMux()
	mux.Handle("GET /api/{cube}/ocr/drafts/{draft_id}", DraftDetailHandlerWithRoot(root))

	t.Run("valid draft with one player returns 200", func(t *testing.T) {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, draftReq(t, "GET", "", d))
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		var out DraftDetail
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if out.Draft.ID != 1 || out.Draft.EventName != "Friday Night" || out.Draft.Date != "2026-01-17" {
			t.Fatalf("draft = %+v", out.Draft)
		}
		if len(out.Players) != 1 || out.Players[0].ID != "p3" {
			t.Fatalf("players = %+v", out.Players)
		}
	})

	t.Run("draft without photos returns 404", func(t *testing.T) {
		bare := newDraft(t, root, types.DraftMetadata{})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, draftReq(t, "GET", "", bare))
		if w.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", w.Code)
		}
	})
}

func TestDraftsHandlerListsNumberedDraftsNewestFirst(t *testing.T) {
	root := t.TempDir()
	older := newDraft(t, root, types.DraftMetadata{EventName: "Friday Night", Flight: "Saturday Morning"})
	newer := newDraft(t, root, types.DraftMetadata{Date: "2026-03-01"})
	sameDay := newDraft(t, root, types.DraftMetadata{})

	// No photos, so not an OCR draft.
	newDraft(t, root, types.DraftMetadata{Date: "2026-04-01"})
	for _, dir := range []string{older.Dir, newer.Dir, sameDay.Dir} {
		writeFile(t, filepath.Join(dir, "img", "p3", "checkin-1.jpg"), "x")
	}
	deck := types.NewDeck()
	deck.ID = 3
	writeDeck(t, older, deck)

	h := DraftsHandlerWithRoot(root)
	r := reqWithCube(t, "GET", "/api/polyverse/ocr/drafts", "polyverse")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	var out struct {
		Drafts []DraftSummary `json:"drafts"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	var ids []int
	for _, s := range out.Drafts {
		ids = append(ids, s.Draft.ID)
	}
	if len(ids) != 3 || ids[0] != newer.ID || ids[1] != sameDay.ID || ids[2] != older.ID {
		t.Fatalf("draft order = %v, want [%d %d %d] (newest date first, then highest id)", ids, newer.ID, sameDay.ID, older.ID)
	}
	first := out.Drafts[2]
	if first.Draft.EventName != "Friday Night" || first.Draft.Flight != "Saturday Morning" || first.Players != 1 {
		t.Fatalf("summary = %+v", first)
	}
}

func TestDraftsHandlerReportsConflicts(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})
	writeFile(t, filepath.Join(d.Dir, "img", "p1", "checkin-1.jpg"), "x")
	// Cube has 1x Brainstorm; the pool claims 2, an over-count conflict.
	writeFile(t, filepath.Join(d.Dir, "cube-snapshot.json"), `{"cards":[{"name":"Brainstorm"}]}`)
	sess := &Session{DraftID: d.ID, Players: map[string]*PlayerWork{
		"p1": pool(entry("Brainstorm", 2)),
	}}
	if err := sess.Save(d); err != nil {
		t.Fatal(err)
	}

	h := DraftsHandlerWithRoot(root)
	r := reqWithCube(t, "GET", "/api/polyverse/ocr/drafts", "polyverse")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	var out struct {
		Drafts []DraftSummary `json:"drafts"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Drafts) != 1 || out.Drafts[0].Conflicts != 1 {
		t.Fatalf("drafts = %+v", out.Drafts)
	}
}
