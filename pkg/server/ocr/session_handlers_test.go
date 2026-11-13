package ocr

import (
	"encoding/json"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestSessionSaveThenGet(t *testing.T) {
	root := t.TempDir()
	draft := newDraft(t, root, types.DraftMetadata{})

	save := SessionSaveHandler(root)
	rs := draftReq(t, "POST", "/session", draft)
	rs.Body = bodyOf(`{"draft_id":7,"players":{"p3":{"status":"in_progress","pool_entries":[{"card_name":"Brainstorm","count":1}],"basics":{},"photos_done":{}}}}`)
	ws := httptest.NewRecorder()
	save.ServeHTTP(ws, rs)
	if ws.Code != 200 {
		t.Fatalf("save status = %draft body=%s", ws.Code, ws.Body.String())
	}

	get := SessionGetHandler(root)
	rg := draftReq(t, "GET", "/session", draft)
	wg := httptest.NewRecorder()
	get.ServeHTTP(wg, rg)
	if wg.Code != 200 {
		t.Fatalf("get status = %draft", wg.Code)
	}
	if !strings.Contains(wg.Body.String(), "Brainstorm") {
		t.Fatalf("get body missing data: %s", wg.Body.String())
	}
	s, err := LoadSession(draft)
	if err != nil {
		t.Fatal(err)
	}
	if s.DraftID != draft.ID {
		t.Fatalf("session draft_id = %draft, want the path's %draft", s.DraftID, draft.ID)
	}
}

// Saving one player must not wipe another player's already-saved work: the
// client autosaves a single player at a time, so the server merges by id.
func TestSessionSaveMergesPlayers(t *testing.T) {
	root := t.TempDir()
	draft := newDraft(t, root, types.DraftMetadata{})
	save := SessionSaveHandler(root)

	post := func(body string) {
		rs := draftReq(t, "POST", "/session", draft)
		rs.Body = bodyOf(body)
		w := httptest.NewRecorder()
		save.ServeHTTP(w, rs)
		if w.Code != 200 {
			t.Fatalf("save status = %draft body=%s", w.Code, w.Body.String())
		}
	}
	post(`{"players":{"p1":{"status":"in_progress","pool_entries":[{"card_name":"Brainstorm","count":1}]}}}`)
	post(`{"players":{"p2":{"status":"in_progress","pool_entries":[{"card_name":"Ponder","count":1}]}}}`)

	s, err := LoadSession(draft)
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
	draft := newDraft(t, root, types.DraftMetadata{})

	rs := draftReq(t, "POST", "/session", draft)
	rs.Body = bodyOf(`{"players":{"p1":{"status":"in_progress","pool_entries":[{"card_name":"Brainstorm","count":44}],"basics":{"Island":3}}}}`)
	ws := httptest.NewRecorder()
	SessionSaveHandler(root).ServeHTTP(ws, rs)
	if ws.Code != 200 {
		t.Fatalf("save status = %draft body=%s", ws.Code, ws.Body.String())
	}

	rg := draftReq(t, "GET", "/session", draft)
	wg := httptest.NewRecorder()
	SessionGetHandler(root).ServeHTTP(wg, rg)

	bodies := map[string]string{
		"save": ws.Body.String(),
		"get":  wg.Body.String(),
	}
	for name, body := range bodies {
		var resp sessionResponse
		if err := json.Unmarshal([]byte(body), &resp); err != nil {
			t.Fatalf("%s: decode %q: %v", name, body, err)
		}
		got, ok := resp.Reviews["p1"]
		if !ok {
			t.Fatalf("%s: no review for p1 in %s", name, body)
		}
		if !slices.Contains(got.Warnings, "Pool has 44 cards (expected 45)") {
			t.Fatalf("%s: warnings = %v", name, got.Warnings)
		}
		if got.Breakdown != (Breakdown{Cards: 3, Lands: 3, Basics: 3}) {
			t.Fatalf("%s: breakdown = %+v", name, got.Breakdown)
		}
	}
}

// blockingCubeSource holds every cube load open until release closes, and
// signals entered when one starts, standing in for a slow CubeCobra.
type blockingCubeSource struct {
	entered chan struct{}
	release chan struct{}
}

func (b blockingCubeSource) Current(string) (*types.Cube, error) {
	b.entered <- struct{}{}
	<-b.release
	return cubeOf("Brainstorm"), nil
}

func (b blockingCubeSource) Refresh(cube string) (*types.Cube, error) {
	return b.Current(cube)
}

// TestSessionSaveDoesNotHoldLockDuringCubeLoad checks that a slow cube load
// for the review doesn't hold the save lock, so other saves don't queue behind
// a network fetch.
func TestSessionSaveDoesNotHoldLockDuringCubeLoad(t *testing.T) {
	root := t.TempDir()
	draft := bareDraft(t, root, types.DraftMetadata{})
	src := blockingCubeSource{entered: make(chan struct{}), release: make(chan struct{})}
	withCubeSource(t, src)

	rs := draftReq(t, "POST", "/session", draft)
	rs.Body = bodyOf(`{"players":{"p1":{"status":"in_progress"}}}`)
	done := make(chan struct{})
	go func() {
		SessionSaveHandler(root).ServeHTTP(httptest.NewRecorder(), rs)
		close(done)
	}()

	<-src.entered
	locked := sessionSaveMu.TryLock()
	if locked {
		sessionSaveMu.Unlock()
	}
	close(src.release)
	<-done
	if !locked {
		t.Fatal("the save lock was held while the cube loaded")
	}
}
