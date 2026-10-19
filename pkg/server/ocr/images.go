package ocr

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"
)

// ImageHandler serves a draft's photos, addressed relative to the draft.
func ImageHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		raw := r.PathValue("path")
		cleanPath, ok := draft.PhotoPath(raw)
		if !ok {
			logrus.WithFields(logrus.Fields{"draft": draft.ID, "path": raw}).Warn("Blocked invalid image path")
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
