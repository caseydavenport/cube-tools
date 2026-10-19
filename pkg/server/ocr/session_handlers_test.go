package ocr

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestSessionSaveThenGet(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})

	save := SessionSaveHandlerWithRoot(root)
	rs := draftReq(t, "POST", "/session", d)
	rs.Body = bodyOf(`{"draft_id":7,"players":{"p3":{"status":"in_progress","pool_entries":[{"card_name":"Brainstorm","count":1}],"basics":{},"photos_done":{}}}}`)
	ws := httptest.NewRecorder()
	save.ServeHTTP(ws, rs)
	if ws.Code != 200 {
		t.Fatalf("save status = %d body=%s", ws.Code, ws.Body.String())
	}

	get := SessionGetHandlerWithRoot(root)
	rg := draftReq(t, "GET", "/session", d)
	wg := httptest.NewRecorder()
	get.ServeHTTP(wg, rg)
	if wg.Code != 200 {
		t.Fatalf("get status = %d", wg.Code)
	}
	if !strings.Contains(wg.Body.String(), "Brainstorm") {
		t.Fatalf("get body missing data: %s", wg.Body.String())
	}
	s, err := LoadSession(d)
	if err != nil {
		t.Fatal(err)
	}
	if s.DraftID != d.ID {
		t.Fatalf("session draft_id = %d, want the path's %d", s.DraftID, d.ID)
	}
}

// Saving one player must not wipe another player's already-saved work: the
// client autosaves a single player at a time, so the server merges by id.
func TestSessionSaveMergesPlayers(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})
	save := SessionSaveHandlerWithRoot(root)

	post := func(body string) {
		rs := draftReq(t, "POST", "/session", d)
		rs.Body = bodyOf(body)
		w := httptest.NewRecorder()
		save.ServeHTTP(w, rs)
		if w.Code != 200 {
			t.Fatalf("save status = %d body=%s", w.Code, w.Body.String())
		}
	}
	post(`{"players":{"p1":{"status":"in_progress","pool_entries":[{"card_name":"Brainstorm","count":1}]}}}`)
	post(`{"players":{"p2":{"status":"in_progress","pool_entries":[{"card_name":"Ponder","count":1}]}}}`)

	s, err := LoadSession(d)
	if err != nil {
		t.Fatal(err)
	}
	if s.Players["p1"] == nil {
		t.Fatalf("p1 was wiped by p2's save: %+v", s.Players)
	}
	if s.Players["p2"] == nil {
		t.Fatalf("p2 missing: %+v", s.Players)
	}
}

func TestSessionResponsesCarryReviews(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})

	rs := draftReq(t, "POST", "/session", d)
	rs.Body = bodyOf(`{"players":{"p1":{"status":"in_progress","pool_entries":[{"card_name":"Brainstorm","count":44}],"basics":{"Island":3}}}}`)
	ws := httptest.NewRecorder()
	SessionSaveHandlerWithRoot(root).ServeHTTP(ws, rs)
	if ws.Code != 200 {
		t.Fatalf("save status = %d body=%s", ws.Code, ws.Body.String())
	}

	rg := draftReq(t, "GET", "/session", d)
	wg := httptest.NewRecorder()
	SessionGetHandlerWithRoot(root).ServeHTTP(wg, rg)

	for name, body := range map[string]string{"save": ws.Body.String(), "get": wg.Body.String()} {
		var resp struct {
			Reviews map[string]PlayerReview `json:"reviews"`
		}
		if err := json.Unmarshal([]byte(body), &resp); err != nil {
			t.Fatalf("%s: decode %q: %v", name, body, err)
		}
		got, ok := resp.Reviews["p1"]
		if !ok {
			t.Fatalf("%s: no review for p1 in %s", name, body)
		}
		if !hasWarning(got.Warnings, "Pool has 44 cards (expected 45)") {
			t.Fatalf("%s: warnings = %v", name, got.Warnings)
		}
		if got.Breakdown != (Breakdown{Cards: 3, Lands: 3, Basics: 3}) {
			t.Fatalf("%s: breakdown = %+v", name, got.Breakdown)
		}
	}
}
