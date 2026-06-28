package ocr

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/server"
)

// reqWithCube builds a test request with the cube id attached the way the
// WithCube middleware would, so handlers calling CubeFromRequest see it.
func reqWithCube(t *testing.T, method, target, cube string) *http.Request {
	t.Helper()
	r := httptest.NewRequest(method, target, nil)
	// WithCube stores the id under an unexported key; in tests we go through
	// the exported setter instead.
	return r.WithContext(server.ContextWithCube(context.Background(), cube))
}

func bodyOf(s string) io.ReadCloser { return io.NopCloser(strings.NewReader(s)) }

// writeFile creates path's parent dirs and writes body, failing the test on error.
func writeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}
