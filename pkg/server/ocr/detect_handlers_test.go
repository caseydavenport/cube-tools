package ocr

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

type fakeDetector struct {
	gotPath string
	gotBox  ocrpkg.Bbox
}

func (f *fakeDetector) DetectPhoto(p string, _ *types.Cube) ([]ocrpkg.MatchResult, error) {
	f.gotPath = p
	return []ocrpkg.MatchResult{{
		DetectedText: "Brainstom", Band: ocrpkg.ConfidenceHigh,
		Candidates: []ocrpkg.Candidate{{Name: "Brainstorm", Score: 0.92}},
		Bbox:       ocrpkg.Bbox{X: 5, Y: 6, Width: 7, Height: 8},
	}}, nil
}

func (f *fakeDetector) MatchRegion(p string, box ocrpkg.Bbox, _ *types.Cube) (ocrpkg.MatchResult, error) {
	f.gotPath, f.gotBox = p, box
	return ocrpkg.MatchResult{
		DetectedText: "Island", Band: ocrpkg.ConfidenceHigh,
		Candidates: []ocrpkg.Candidate{{Name: "Island", Score: 0.99}}, Bbox: box,
	}, nil
}

func setupCube(t *testing.T, root string) {
	t.Helper()
	writeFile(t, filepath.Join(root, "polyverse", "2026-01-17", "cube-snapshot.json"),
		`{"cards":[{"name":"Brainstorm"},{"name":"Island"}]}`)
}

func TestDetectHandler(t *testing.T) {
	root := t.TempDir()
	setupCube(t, root)
	rel := "2026-01-17_evt_1/img/p3/checkin-1.jpg"
	writeFile(t, filepath.Join(root, "polyverse", rel), "x")

	fd := &fakeDetector{}
	h := DetectHandlerWithRoot(fd, root)
	r := reqWithCube(t, "POST", "/api/polyverse/ocr/detect", "polyverse")
	r.Body = bodyOf(`{"photo":"` + rel + `"}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}
	if !strings.HasSuffix(fd.gotPath, rel) {
		t.Fatalf("detector got path %q", fd.gotPath)
	}
	var out struct {
		Lines []LineJSON `json:"lines"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Lines) != 1 || out.Lines[0].Chosen != "Brainstorm" {
		t.Fatalf("lines = %+v", out.Lines)
	}
}

func TestRegionHandlerRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	setupCube(t, root)
	h := RegionHandlerWithRoot(&fakeDetector{}, root)
	r := reqWithCube(t, "POST", "/api/polyverse/ocr/region", "polyverse")
	r.Body = bodyOf(`{"photo":"../../etc/passwd","box":{"X":0,"Y":0,"Width":1,"Height":1}}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("status = %d, want 403", w.Code)
	}
}
