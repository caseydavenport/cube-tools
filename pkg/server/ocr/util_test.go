package ocr

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
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
