package ocr

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

type fakeDetector struct {
	gotPath   string
	gotBox    ocrpkg.Bbox
	gotSleeve string
}

func (f *fakeDetector) DetectPhoto(p string, _ *types.Cube, sleeveColor string) ([]ocrpkg.MatchResult, error) {
	f.gotPath, f.gotSleeve = p, sleeveColor
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

// setupCube creates a draft with a cube snapshot, in a cube registered with a
// sleeve color.
func setupCube(t *testing.T, root string) drafts.Draft {
	t.Helper()
	d := newDraft(t, root, types.DraftMetadata{})
	writeFile(t, filepath.Join(d.Dir, "cube-snapshot.json"), `{"cards":[{"name":"Brainstorm"},{"name":"Island"}]}`)
	writeFile(t, filepath.Join(root, "cubes.json"),
		`{"cubes":[{"id":"polyverse","name":"Polyverse","sleeve_color":"purple"}]}`)
	return d
}

func TestDetectHandler(t *testing.T) {
	root := t.TempDir()
	d := setupCube(t, root)
	rel := "img/p3/checkin-1.jpg"
	writeFile(t, filepath.Join(d.Dir, rel), "x")

	fd := &fakeDetector{}
	h := DetectHandler(fd, root)
	r := draftReq(t, "POST", "/detect", d)
	r.Body = bodyOf(`{"photo":"` + rel + `"}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}
	if fd.gotPath != filepath.Join(d.Dir, rel) {
		t.Fatalf("detector got path %q", fd.gotPath)
	}
	if fd.gotSleeve != "purple" {
		t.Fatalf("detector got sleeve color %q, want purple", fd.gotSleeve)
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
	d := setupCube(t, root)
	other := newDraft(t, root, types.DraftMetadata{})
	writeFile(t, filepath.Join(other.Dir, "img", "p1", "a.jpg"), "x")
	h := RegionHandler(&fakeDetector{}, root)
	for _, photo := range []string{"../../etc/passwd", "../" + filepath.Base(other.Dir) + "/img/p1/a.jpg", "/etc/passwd"} {
		r := draftReq(t, "POST", "/region", d)
		r.Body = bodyOf(`{"photo":"` + photo + `","box":{"X":0,"Y":0,"Width":1,"Height":1}}`)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Errorf("photo %q: status = %d, want 403", photo, w.Code)
		}
	}
}

func TestUnknownDraftIs404(t *testing.T) {
	root := t.TempDir()
	setupCube(t, root)
	handlers := map[string]http.Handler{
		"detect":      DetectHandler(&fakeDetector{}, root),
		"region":      RegionHandler(&fakeDetector{}, root),
		"rotate":      RotateHandler(root),
		"image":       ImageHandler(root),
		"detail":      DraftDetailHandler(root),
		"cards":       CardsHandler(root),
		"consistency": ConsistencyHandler(root),
		"session":     SessionGetHandler(root),
		"confirm":     ConfirmHandler(root),
		"scan":        ScanStatusHandler(root),
	}
	for name, h := range handlers {
		for _, id := range []string{"99", "abc", "0001_2026-01-17", "../1"} {
			r := reqWithCube(t, "POST", "/api/polyverse/ocr/drafts/x", "polyverse")
			r.SetPathValue("draft_id", id)
			r.SetPathValue("player", "p1")
			r.SetPathValue("path", "img/p1/a.jpg")
			r.Body = bodyOf(`{"photo":"img/p1/a.jpg","direction":"cw"}`)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != http.StatusNotFound {
				t.Errorf("%s draft %q: status = %d, want 404", name, id, w.Code)
			}
		}
	}
}
