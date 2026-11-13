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
		defer closeAndLog(f, cleanPath)
		info, err := f.Stat()
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Photos can be rotated in place, so make the browser revalidate: it
		// gets a cheap 304 for an unchanged file and a fresh copy after a rotate.
		rw.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(rw, r, filepath.Base(cleanPath), info.ModTime(), f)
	})
}
