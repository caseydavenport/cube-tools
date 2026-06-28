package ocr

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestDiscoverPlayers(t *testing.T) {
	root := t.TempDir()
	draftID := "2026-01-17_evt_1"
	base := filepath.Join(root, "polyverse", draftID)
	writeFile(t, filepath.Join(base, "img", "p3", "checkin-1.jpg"), "x")
	writeFile(t, filepath.Join(base, "img", "p3", "checkin-2.jpg"), "x")
	writeFile(t, filepath.Join(base, "img", "p3", "deck-1.jpg"), "x")
	// deck file with no cards yet (as import-hedron leaves it)
	writeFile(t, filepath.Join(base, draftID+"-p3.json"),
		`{"metadata":{"draft_id":"`+draftID+`"},"player":"`+draftID+`-p3","date":"2026-01-17","labels":[],"matches":[{"opponent":"`+draftID+`-p5","wins":2,"losses":1}],"mainboard":[],"sideboard":[]}`)

	players, err := discoverPlayers(root, "polyverse", draftID)
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
	if p.Photos.Checkin[0] != draftID+"/img/p3/checkin-1.jpg" {
		t.Fatalf("checkin[0] = %q", p.Photos.Checkin[0])
	}
	if p.HasDeck {
		t.Fatalf("HasDeck should be false for empty deck")
	}
	if len(p.Matches) != 1 {
		t.Fatalf("matches = %d, want 1", len(p.Matches))
	}
}

func TestDraftDetailHandler(t *testing.T) {
	root := t.TempDir()
	draftID := "2026-01-17_evt_1"
	base := filepath.Join(root, "polyverse", draftID)
	writeFile(t, filepath.Join(base, "img", "p3", "checkin-1.jpg"), "x")

	mux := http.NewServeMux()
	mux.Handle("GET /api/{cube}/ocr/drafts/{draft_id}", DraftDetailHandlerWithRoot(root))

	t.Run("valid draft with one player returns 200", func(t *testing.T) {
		r := reqWithCube(t, "GET", "/api/polyverse/ocr/drafts/"+draftID, "polyverse")
		r.SetPathValue("draft_id", draftID)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		var out DraftDetail
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if len(out.Players) != 1 || out.Players[0].ID != "p3" {
			t.Fatalf("players = %+v", out.Players)
		}
	})

	t.Run("unknown draft_id returns 404", func(t *testing.T) {
		r := reqWithCube(t, "GET", "/api/polyverse/ocr/drafts/2099-01-01_no_such", "polyverse")
		r.SetPathValue("draft_id", "2099-01-01_no_such")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", w.Code)
		}
	})

	t.Run("traversal draft_id returns 404", func(t *testing.T) {
		r := reqWithCube(t, "GET", "/api/polyverse/ocr/drafts/..%2F..%2Fetc%2Fpasswd", "polyverse")
		r.SetPathValue("draft_id", "../../etc/passwd")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", w.Code)
		}
	})
}

func TestDraftsHandlerListsDraftsWithImages(t *testing.T) {
	root := t.TempDir()
	draftID := "2026-01-17_evt_1"
	base := filepath.Join(root, "polyverse", draftID)
	writeFile(t, filepath.Join(base, "img", "p3", "checkin-1.jpg"), "x")
	writeFile(t, filepath.Join(base, "metadata.json"), `{"event_name":"Friday Night","flight":"Saturday Morning"}`)
	writeFile(t, filepath.Join(base, draftID+"-p3.json"),
		`{"metadata":{"draft_id":"`+draftID+`"},"player":"`+draftID+`-p3","date":"2026-01-17","labels":[],"matches":[],"mainboard":[],"sideboard":[]}`)

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
	if len(out.Drafts) != 1 || out.Drafts[0].EventName != "Friday Night" || out.Drafts[0].Players != 1 {
		t.Fatalf("drafts = %+v", out.Drafts)
	}
	if out.Drafts[0].Flight != "Saturday Morning" {
		t.Fatalf("flight = %q, want Saturday Morning", out.Drafts[0].Flight)
	}
}

func TestDraftsHandlerReportsConflicts(t *testing.T) {
	root := t.TempDir()
	cube := "polyverse"
	draftID := "2026-01-17_evt_1"
	base := filepath.Join(root, cube, draftID)
	writeFile(t, filepath.Join(base, "img", "p1", "checkin-1.jpg"), "x")
	// Cube has 1x Brainstorm; the pool claims 2, an over-count conflict.
	writeFile(t, filepath.Join(root, cube, "2026-01-17", "cube-snapshot.json"),
		`{"cards":[{"name":"Brainstorm"}]}`)
	sess := &Session{DraftID: draftID, Players: map[string]*PlayerWork{
		"p1": pool(entry("Brainstorm", 2)),
	}}
	if err := sess.Save(root, cube); err != nil {
		t.Fatal(err)
	}

	h := DraftsHandlerWithRoot(root)
	r := reqWithCube(t, "GET", "/api/polyverse/ocr/drafts", cube)
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
