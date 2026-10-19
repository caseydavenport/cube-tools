package ocr

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// scanFakeDetector is stateless so the worker pool can call it concurrently
// without racing on shared fields.
type scanFakeDetector struct{}

func (scanFakeDetector) DetectPhoto(_ string, _ *types.Cube, _ string) ([]ocrpkg.MatchResult, error) {
	return []ocrpkg.MatchResult{
		{
			DetectedText: "Brainstom",
			Band:         ocrpkg.ConfidenceHigh,
			Candidates:   []ocrpkg.Candidate{{Name: "Brainstorm", Score: 0.92}},
			Bbox:         ocrpkg.Bbox{X: 5, Y: 6, Width: 7, Height: 8},
		},
	}, nil
}

func (scanFakeDetector) MatchRegion(_ string, box ocrpkg.Bbox, _ *types.Cube) (ocrpkg.MatchResult, error) {
	return ocrpkg.MatchResult{Bbox: box}, nil
}

func startScan(t *testing.T, root string, d drafts.Draft) {
	t.Helper()
	h := ScanStartHandler(scanFakeDetector{}, root)
	r := draftReq(t, "POST", "/scan", d)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("scan start status = %d body=%s", w.Code, w.Body.String())
	}
}

func waitScanDone(t *testing.T, draftID int) scanStatus {
	t.Helper()
	for range 200 {
		scanJobsMu.Lock()
		j := scanJobs[scanKey("polyverse", draftID)]
		scanJobsMu.Unlock()
		if j != nil {
			if st := j.status(); st.State == scanDone {
				return st
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("scan did not finish in time")
	return scanStatus{}
}

func TestScanFillsSession(t *testing.T) {
	root := t.TempDir()
	d := setupCube(t, root)
	checkin := "img/p3/checkin-1.jpg"
	deck := "img/p3/deck-1.jpg"
	writeFile(t, filepath.Join(d.Dir, checkin), "x")
	writeFile(t, filepath.Join(d.Dir, deck), "x")

	startScan(t, root, d)
	st := waitScanDone(t, d.ID)
	if st.Total != 2 {
		t.Fatalf("total = %d, want 2", st.Total)
	}

	s, err := LoadSession(d)
	if err != nil {
		t.Fatal(err)
	}
	pw := s.Players["p3"]
	if pw == nil {
		t.Fatalf("p3 has no work: %+v", s.Players)
	}
	if len(pw.Boxes[checkin]) != 1 || pw.Boxes[checkin][0].Chosen != "Brainstorm" {
		t.Fatalf("pool boxes = %+v", pw.Boxes)
	}
	if len(pw.DeckBoxes[deck]) != 1 || pw.DeckBoxes[deck][0].Chosen != "Brainstorm" {
		t.Fatalf("deck boxes = %+v", pw.DeckBoxes)
	}
}

// A photo that already has boxes (scanned or hand-corrected) must be left alone:
// the worklist skips it, so a re-run never re-detects or clobbers it.
func TestScanSkipsExistingBoxes(t *testing.T) {
	root := t.TempDir()
	d := setupCube(t, root)
	checkin := "img/p3/checkin-1.jpg"
	deck := "img/p3/deck-1.jpg"
	writeFile(t, filepath.Join(d.Dir, checkin), "x")
	writeFile(t, filepath.Join(d.Dir, deck), "x")

	// Seed the pool photo with a hand-corrected box.
	manual := Box{ID: checkin + ":0", Status: "high", Chosen: "Ponder", Bbox: ocrpkg.Bbox{X: 1, Y: 2, Width: 3, Height: 4}}
	seed := &Session{
		DraftID: d.ID,
		Players: map[string]*PlayerWork{
			"p3": {Boxes: map[string][]Box{checkin: {manual}}},
		},
	}
	if err := seed.Save(d); err != nil {
		t.Fatal(err)
	}

	startScan(t, root, d)
	st := waitScanDone(t, d.ID)
	// Only the deck photo is unscanned, so the worklist should be just that one.
	if st.Total != 1 {
		t.Fatalf("total = %d, want 1 (only the unscanned deck photo)", st.Total)
	}

	s, err := LoadSession(d)
	if err != nil {
		t.Fatal(err)
	}
	pw := s.Players["p3"]
	if len(pw.Boxes[checkin]) != 1 || pw.Boxes[checkin][0].Chosen != "Ponder" {
		t.Fatalf("hand-corrected box was overwritten: %+v", pw.Boxes[checkin])
	}
	if len(pw.DeckBoxes[deck]) != 1 {
		t.Fatalf("deck photo not scanned: %+v", pw.DeckBoxes)
	}
}
