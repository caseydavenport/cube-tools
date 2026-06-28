package ocr

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// loadTestCube writes a snapshot and loads it as a cube for the pure-function
// tests. The snapshot repeats a name once per copy, matching the real format.
func loadTestCube(t *testing.T, body string) *types.Cube {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "polyverse", "2026-01-17", "cube-snapshot.json"), body)
	cl, err := types.LoadCubeList(types.LoadOptions{DataRoot: root, Cube: "polyverse", Date: "2026-01-17"})
	if err != nil {
		t.Fatal(err)
	}
	return cl
}

func TestBuildConsistencyReport(t *testing.T) {
	// Cube has 2x Brainstorm, 1x Misty Rainforest.
	cl := loadTestCube(t, `{"cards":[{"name":"Brainstorm"},{"name":"Brainstorm"},{"name":"Misty Rainforest"}]}`)

	t.Run("clean", func(t *testing.T) {
		sess := &Session{Players: map[string]*PlayerWork{
			"a": pool(entry("Brainstorm", 1), entry("Misty Rainforest", 1)),
			"b": pool(entry("Brainstorm", 1)),
		}}
		got := buildConsistencyReport(cl, sess, 2)
		if len(got.Discrepancies) != 0 {
			t.Fatalf("expected no discrepancies, got %+v", got.Discrepancies)
		}
		if got.PoolTotal != 3 || got.CubeTotal != 3 {
			t.Fatalf("totals: pool=%d cube=%d", got.PoolTotal, got.CubeTotal)
		}
		if got.PlayersCounted != 2 || got.PlayersTotal != 2 {
			t.Fatalf("players: counted=%d total=%d", got.PlayersCounted, got.PlayersTotal)
		}
	})

	t.Run("over", func(t *testing.T) {
		// Three copies of a 2-copy card: an OCR over-count.
		sess := &Session{Players: map[string]*PlayerWork{
			"a": pool(entry("Brainstorm", 2)),
			"b": pool(entry("Brainstorm", 1), entry("Misty Rainforest", 1)),
		}}
		got := buildConsistencyReport(cl, sess, 2)
		if len(got.Discrepancies) != 1 {
			t.Fatalf("expected 1 discrepancy, got %+v", got.Discrepancies)
		}
		d := got.Discrepancies[0]
		if d.CardName != "Brainstorm" || d.Kind != "over" || d.Pooled != 3 || d.Cube != 2 {
			t.Fatalf("discrepancy = %+v", d)
		}
	})

	t.Run("missing", func(t *testing.T) {
		// Only one Brainstorm pooled, Misty Rainforest not scanned at all.
		sess := &Session{Players: map[string]*PlayerWork{
			"a": pool(entry("Brainstorm", 1)),
		}}
		got := buildConsistencyReport(cl, sess, 2)
		kinds := map[string]Discrepancy{}
		for _, d := range got.Discrepancies {
			kinds[d.CardName] = d
		}
		if kinds["Brainstorm"].Kind != "missing" || kinds["Brainstorm"].Pooled != 1 {
			t.Fatalf("Brainstorm = %+v", kinds["Brainstorm"])
		}
		if kinds["Misty Rainforest"].Kind != "missing" || kinds["Misty Rainforest"].Pooled != 0 {
			t.Fatalf("Misty Rainforest = %+v", kinds["Misty Rainforest"])
		}
	})

	t.Run("unknown", func(t *testing.T) {
		// A name not in the cube: an OCR misread.
		sess := &Session{Players: map[string]*PlayerWork{
			"a": pool(entry("Brainstorm", 2), entry("Misty Rainforest", 1), entry("Brainstrm", 1)),
		}}
		got := buildConsistencyReport(cl, sess, 1)
		var unknown []Discrepancy
		for _, d := range got.Discrepancies {
			if d.Kind == "unknown" {
				unknown = append(unknown, d)
			}
		}
		if len(unknown) != 1 || unknown[0].CardName != "Brainstrm" || unknown[0].Pooled != 1 || unknown[0].Cube != 0 {
			t.Fatalf("unknown = %+v", unknown)
		}
		// unknown sorts ahead of any missing/over.
		if got.Discrepancies[0].Kind != "unknown" {
			t.Fatalf("expected unknown first, got %+v", got.Discrepancies)
		}
	})

	t.Run("captures attach to over and unknown, not missing", func(t *testing.T) {
		// Brainstorm over-counted (3 of 2), Brainstrm a misread unknown, Misty
		// Rainforest fully pooled. The boxes behind the bad names should attach.
		sess := &Session{Players: map[string]*PlayerWork{
			"a": {
				PoolEntries: []PoolEntry{entry("Brainstorm", 3), entry("Misty Rainforest", 1), entry("Brainstrm", 1)},
				Boxes: map[string][]Box{
					"a/checkin-1.jpg": {
						{ID: "b1", Chosen: "Brainstorm", Status: "high"},
						{ID: "b2", Chosen: "Brainstrm", Status: "low"},
						{ID: "b3", Chosen: "Misty Rainforest", Status: "high"},
						{ID: "b4", Chosen: "", Status: "unmatched"},
					},
					"a/checkout-1.jpg": {
						{ID: "b5", Chosen: "Brainstorm", Status: "high"},
					},
				},
			},
		}}
		got := buildConsistencyReport(cl, sess, 1)
		byName := map[string]Discrepancy{}
		for _, d := range got.Discrepancies {
			byName[d.CardName] = d
		}
		// Brainstorm boxes (b1 on check-in, b5 on check-out) both attach.
		over := byName["Brainstorm"]
		if over.Kind != "over" || len(over.Captures) != 2 {
			t.Fatalf("Brainstorm captures = %+v", over)
		}
		ids := map[string]bool{}
		for _, c := range over.Captures {
			if c.Player != "a" {
				t.Fatalf("capture player = %q, want a", c.Player)
			}
			ids[c.BoxID] = true
		}
		if !ids["b1"] || !ids["b5"] {
			t.Fatalf("Brainstorm captures missing boxes: %+v", over.Captures)
		}
		// The misread attaches its single box.
		unknown := byName["Brainstrm"]
		if unknown.Kind != "unknown" || len(unknown.Captures) != 1 || unknown.Captures[0].BoxID != "b2" {
			t.Fatalf("Brainstrm captures = %+v", unknown)
		}
		// Misty Rainforest is clean, so it isn't a discrepancy and has no captures.
		if _, ok := byName["Misty Rainforest"]; ok {
			t.Fatalf("Misty Rainforest should not be a discrepancy: %+v", byName["Misty Rainforest"])
		}
	})

	t.Run("basics excluded and case-insensitive", func(t *testing.T) {
		clBasic := loadTestCube(t, `{"cards":[{"name":"Brainstorm"}]}`)
		sess := &Session{Players: map[string]*PlayerWork{
			"a": pool(entry("brainstorm", 1), entry("Island", 5), entry("Forest", 3)),
		}}
		got := buildConsistencyReport(clBasic, sess, 1)
		if len(got.Discrepancies) != 0 {
			t.Fatalf("basics/case should not create discrepancies, got %+v", got.Discrepancies)
		}
		if got.PoolTotal != 1 {
			t.Fatalf("pool total should exclude basics, got %d", got.PoolTotal)
		}
	})
}

func TestConsistencyHandler(t *testing.T) {
	root := t.TempDir()
	draftID := "2026-01-17_evt_1"
	cube := "polyverse"
	writeFile(t, filepath.Join(root, cube, "2026-01-17", "cube-snapshot.json"),
		`{"cards":[{"name":"Brainstorm"},{"name":"Brainstorm"},{"name":"Misty Rainforest"}]}`)
	// Two players need img dirs so discoverPlayers reports them.
	writeFile(t, filepath.Join(root, cube, draftID, "img", "p1", "checkin-1.jpg"), "x")
	writeFile(t, filepath.Join(root, cube, draftID, "img", "p2", "checkin-1.jpg"), "x")

	sess := &Session{DraftID: draftID, Players: map[string]*PlayerWork{
		"p1": pool(entry("Brainstorm", 2), entry("Misty Rainforest", 1)),
	}}
	if err := sess.Save(root, cube); err != nil {
		t.Fatal(err)
	}

	h := ConsistencyHandlerWithRoot(root)
	r := reqWithCube(t, "GET", "/api/polyverse/ocr/drafts/"+draftID+"/consistency", cube)
	r.SetPathValue("draft_id", draftID)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
	var rep ConsistencyReport
	if err := json.Unmarshal(w.Body.Bytes(), &rep); err != nil {
		t.Fatal(err)
	}
	if rep.PlayersTotal != 2 || rep.PlayersCounted != 1 {
		t.Fatalf("players: total=%d counted=%d", rep.PlayersTotal, rep.PlayersCounted)
	}
	// Brainstorm pooled fully (2/2), Misty Rainforest fully (1/1): clean so far.
	if len(rep.Discrepancies) != 0 {
		t.Fatalf("expected no discrepancies, got %+v", rep.Discrepancies)
	}
}
