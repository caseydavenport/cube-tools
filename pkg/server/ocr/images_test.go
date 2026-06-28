package ocr

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestImageHandlerServesFile(t *testing.T) {
	root := t.TempDir()
	rel := "2026-01-17_evt_1/img/p3/checkin-1.jpg"
	full := filepath.Join(root, "polyverse", rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte("JPEGDATA"), 0o644); err != nil {
		t.Fatal(err)
	}

	h := ImageHandlerWithRoot(root)
	r := reqWithCube(t, "GET", "/api/polyverse/img/"+rel, "polyverse")
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

func TestImageHandlerRejectsTraversal(t *testing.T) {
	h := ImageHandlerWithRoot(t.TempDir())
	r := reqWithCube(t, "GET", "/api/polyverse/img/../../etc/passwd", "polyverse")
	r.SetPathValue("path", "../../etc/passwd")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", w.Code)
	}
}
