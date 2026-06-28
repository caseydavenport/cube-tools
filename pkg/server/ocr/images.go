package ocr

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/sirupsen/logrus"
)

// ImageHandler serves draft photos from data/<cube>/<path>.
func ImageHandler() http.Handler { return ImageHandlerWithRoot("data") }

// ImageHandlerWithRoot is ImageHandler with an injectable data root for tests.
func ImageHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		raw := r.PathValue("path")
		cleanPath := filepath.Clean(filepath.Join(dataRoot, cube, raw))
		prefix := filepath.Clean(filepath.Join(dataRoot, cube)) + string(filepath.Separator)
		if cube == "" || raw == "" || strings.Contains(raw, "..") || !strings.HasPrefix(cleanPath, prefix) {
			logrus.WithFields(logrus.Fields{"cube": cube, "path": raw}).Warn("Blocked invalid image path")
			http.Error(rw, "Invalid path", http.StatusForbidden)
			return
		}
		f, err := os.Open(cleanPath)
		if err != nil {
			http.NotFound(rw, r)
			return
		}
		defer f.Close()
		st, err := f.Stat()
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		// Photos can be rotated in place, so force revalidation: the browser
		// still gets a cheap 304 when the file is unchanged, but picks up a
		// rotated file on the next load instead of serving a stale copy.
		rw.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(rw, r, filepath.Base(cleanPath), st.ModTime(), f)
	})
}
