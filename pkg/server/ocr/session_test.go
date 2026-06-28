package ocr

import (
	"os"
	"path/filepath"
	"testing"

	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
)

func TestSessionRoundTrip(t *testing.T) {
	root := t.TempDir()
	draftID := "2026-01-17_evt_1"
	if err := os.MkdirAll(filepath.Join(root, "polyverse", draftID), 0o755); err != nil {
		t.Fatal(err)
	}

	photo := draftID + "/img/p3/checkin-1.jpg"
	s := &Session{DraftID: draftID, Players: map[string]*PlayerWork{
		"p3": {
			Status: "in_progress",
			Boxes: map[string][]Box{photo: {{
				ID:     photo + ":0",
				Bbox:   ocrpkg.Bbox{X: 1, Y: 2, Width: 3, Height: 4},
				Status: "high",
				Chosen: "Counterspell",
			}}},
			Bonus:  map[string]int{"Counterspell": 1},
			Basics: map[string]int{"Island": 7},
			PoolEntries: []PoolEntry{{
				CardName: "Counterspell", Count: 1,
				Source: Source{Photo: photo, Box: ocrpkg.Bbox{X: 1, Y: 2, Width: 3, Height: 4}},
			}},
		},
	}}
	if err := s.Save(root, "polyverse"); err != nil {
		t.Fatal(err)
	}

	got, err := LoadSession(root, "polyverse", draftID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Players["p3"].Boxes[photo][0].Chosen != "Counterspell" {
		t.Fatalf("round-trip lost box data: %+v", got.Players["p3"])
	}
	if got.Players["p3"].Bonus["Counterspell"] != 1 {
		t.Fatalf("bonus lost: %+v", got.Players["p3"].Bonus)
	}
	if got.Players["p3"].Basics["Island"] != 7 {
		t.Fatalf("basics lost: %+v", got.Players["p3"].Basics)
	}
}

func TestLoadSessionMissingIsEmpty(t *testing.T) {
	root := t.TempDir()
	s, err := LoadSession(root, "polyverse", "2026-01-17_evt_1")
	if err != nil {
		t.Fatalf("missing file should not error: %v", err)
	}
	if s == nil || len(s.Players) != 0 {
		t.Fatalf("expected empty session, got %+v", s)
	}
}

func TestSaveCreatesDirectory(t *testing.T) {
	root := t.TempDir()
	draftID := "2026-01-17_evt_2"

	s := &Session{DraftID: draftID, Players: map[string]*PlayerWork{
		"p1": {
			Status: "in_progress",
			Basics: map[string]int{"Plains": 3},
		},
	}}
	if err := s.Save(root, "polyverse"); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	got, err := LoadSession(root, "polyverse", draftID)
	if err != nil {
		t.Fatalf("LoadSession failed: %v", err)
	}
	if got.Players["p1"].Basics["Plains"] != 3 {
		t.Fatalf("basics lost: %+v", got.Players["p1"].Basics)
	}
}
