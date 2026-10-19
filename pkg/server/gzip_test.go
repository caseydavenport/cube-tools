package server_test

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/server"
)

const gzipBody = `{"decks":[{"id":1},{"id":2}]}`

// gzipCase is one request through the gzip middleware and whether the
// response should come back compressed.
type gzipCase struct {
	name           string
	path           string
	acceptEncoding string
	wantGzip       bool
}

// serveThroughGzip sends one request through Gzip wrapped around a handler that
// writes gzipBody.
func serveThroughGzip(t *testing.T, path, acceptEncoding string) *httptest.ResponseRecorder {
	t.Helper()
	inner := http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		rw.Header().Set("Content-Type", "application/json")
		_, err := io.WriteString(rw, gzipBody)
		assert.NoError(t, err)
	})
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if acceptEncoding != "" {
		req.Header.Set("Accept-Encoding", acceptEncoding)
	}
	rec := httptest.NewRecorder()
	server.Gzip(inner).ServeHTTP(rec, req)
	return rec
}

func TestGzipCompressesWhenTheClientAccepts(t *testing.T) {
	cases := []gzipCase{
		{name: "browser accepts gzip", path: "/api/polyverse/decks", acceptEncoding: "gzip, deflate, br", wantGzip: true},
		{name: "client doesn't accept gzip", path: "/api/polyverse/decks", acceptEncoding: "", wantGzip: false},
		{name: "photo routes are left alone", path: "/api/polyverse/ocr/drafts/3/img/p1.jpg", acceptEncoding: "gzip", wantGzip: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := serveThroughGzip(t, tc.path, tc.acceptEncoding)
			assert.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, "Accept-Encoding", rec.Header().Get("Vary"))

			if !tc.wantGzip {
				assert.Empty(t, rec.Header().Get("Content-Encoding"))
				assert.Equal(t, gzipBody, rec.Body.String())
				return
			}

			assert.Equal(t, "gzip", rec.Header().Get("Content-Encoding"))
			assert.Empty(t, rec.Header().Get("Content-Length"))
			zr, err := gzip.NewReader(rec.Body)
			require.NoError(t, err)
			plain, err := io.ReadAll(zr)
			require.NoError(t, err)
			assert.Equal(t, gzipBody, string(plain))
		})
	}
}

func TestGzipPassesErrorStatusThrough(t *testing.T) {
	inner := http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		http.Error(rw, "read-only cube", http.StatusForbidden)
	})
	req := httptest.NewRequest(http.MethodPost, "/api/cc:abc/import/commit", strings.NewReader("{}"))
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	server.Gzip(inner).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestGzipLeavesEmptyResponsesEmpty(t *testing.T) {
	inner := http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		rw.WriteHeader(http.StatusNoContent)
	})
	req := httptest.NewRequest(http.MethodPost, "/api/polyverse/refresh", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	server.Gzip(inner).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Header().Get("Content-Encoding"))
	assert.Empty(t, rec.Body.Bytes())
}
