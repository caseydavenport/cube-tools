package ocr

import (
	"path/filepath"
	"testing"

	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
)

func TestSessionRoundTrip(t *testing.T) {
	dir := t.TempDir()
	photo := "img/p3/checkin-1.jpg"
	s := &Session{DraftID: 1, Players: map[string]*PlayerWork{
		"p3": {
			Status: "in_progress",
			Boxes: map[string][]Box{photo: {{
				ID:     photo + ":0",
				Bbox:   ocrpkg.Bbox{X: 1, Y: 2, Width: 3, Height: 4},
				Status: "high",
				Chosen: "Counterspell",
			}}},
			Overrides: map[string]int{"Counterspell": 1},
			Basics:    map[string]int{"Island": 7},
			PoolEntries: []PoolEntry{{
				CardName: "Counterspell", Count: 1,
				Source: Source{Photo: photo, Box: ocrpkg.Bbox{X: 1, Y: 2, Width: 3, Height: 4}},
			}},
		},
	}}
	if err := s.Save(dir); err != nil {
		t.Fatal(err)
	}

	got, err := LoadSession(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.Players["p3"].Boxes[photo][0].Chosen != "Counterspell" {
		t.Fatalf("round-trip lost box data: %+v", got.Players["p3"])
	}
	if got.Players["p3"].Overrides["Counterspell"] != 1 {
		t.Fatalf("overrides lost: %+v", got.Players["p3"].Overrides)
	}
	if got.Players["p3"].Basics["Island"] != 7 {
		t.Fatalf("basics lost: %+v", got.Players["p3"].Basics)
	}
}

func TestLoadSessionMissingIsEmpty(t *testing.T) {
	s, err := LoadSession(t.TempDir())
	if err != nil {
		t.Fatalf("missing file should not error: %v", err)
	}
	if s == nil || len(s.Players) != 0 {
		t.Fatalf("expected empty session, got %+v", s)
	}
}

func TestSaveCreatesDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "0002_2026-01-17")

	s := &Session{DraftID: 2, Players: map[string]*PlayerWork{
		"p1": {
			Status: "in_progress",
			Basics: map[string]int{"Plains": 3},
		},
	}}
	if err := s.Save(dir); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	got, err := LoadSession(dir)
	if err != nil {
		t.Fatalf("LoadSession failed: %v", err)
	}
	if got.Players["p1"].Basics["Plains"] != 3 {
		t.Fatalf("basics lost: %+v", got.Players["p1"].Basics)
	}
}
