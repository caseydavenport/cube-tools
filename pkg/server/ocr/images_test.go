package ocr

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestImageHandlerServesFile(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})
	rel := "img/p3/checkin-1.jpg"
	full := filepath.Join(d.Dir, rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte("JPEGDATA"), 0o644); err != nil {
		t.Fatal(err)
	}

	h := ImageHandler(root)
	r := draftReq(t, "GET", "/img/"+rel, d)
	r.SetPathValue("path", rel)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if w.Code != 200 {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if w.Body.String() != "JPEGDATA" {
		t.Fatalf("body = %q", w.Body.String())
	}
}

func TestImageHandlerRefusesEscape(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})
	other := newDraft(t, root, types.DraftMetadata{})
	writeFile(t, filepath.Join(other.Dir, "img", "a.jpg"), "x")
	h := ImageHandler(root)
	for _, path := range []string{"../" + filepath.Base(other.Dir) + "/img/a.jpg", "/etc/passwd", "../../etc/passwd"} {
		r := draftReq(t, "GET", "/img/x", d)
		r.SetPathValue("path", path)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusForbidden {
			t.Errorf("path %q: status = %d, want 403", path, w.Code)
		}
	}
}
