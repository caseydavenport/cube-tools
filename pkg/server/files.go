package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/sirupsen/logrus"
)

// cubeFileHandler serves a single named JSON file from data/{cube}/.
func cubeFileHandler(name string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		path := filepath.Join("data", cube, name)
		serveJSONFile(rw, r, path)
	})
}

// CubeContentHandler serves data/{cube}/cube.json.
func CubeContentHandler() http.Handler { return cubeFileHandler("cube.json") }

// CubeIndexHandler serves data/{cube}/index.json.
func CubeIndexHandler() http.Handler { return cubeFileHandler("index.json") }

// DraftLogHandler serves data/{cube}/{draft_id}/draft-log.json.
func DraftLogHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		if cube == "" || draftID == "" || strings.ContainsAny(draftID, `/\`) || strings.Contains(draftID, "..") {
			http.NotFound(rw, r)
			return
		}
		path := filepath.Join("data", cube, draftID, "draft-log.json")
		serveJSONFile(rw, r, path)
	})
}

// NotesHandler serves a notes file via ?path=... where the path must live under
// data/{cube}/. Returns empty body with 200 when the file is missing, matching
// the previous client behavior that tolerated missing notes.
func NotesHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		raw := r.URL.Query().Get("path")
		cleanPath := filepath.Clean(raw)
		prefix := filepath.Clean(filepath.Join("data", cube)) + string(filepath.Separator)
		if cube == "" || raw == "" || strings.Contains(raw, "..") || !strings.HasPrefix(cleanPath+string(filepath.Separator), prefix) {
			logrus.WithFields(logrus.Fields{"cube": cube, "path": raw}).Warn("Blocked invalid notes path")
			http.Error(rw, "Invalid path", http.StatusForbidden)
			return
		}
		data, err := os.ReadFile(cleanPath)
		if err != nil {
			if os.IsNotExist(err) {
				rw.WriteHeader(http.StatusOK)
				return
			}
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		_, _ = rw.Write(data)
	})
}

func serveJSONFile(rw http.ResponseWriter, r *http.Request, path string) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			http.NotFound(rw, r)
			return
		}
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	http.ServeContent(rw, r, filepath.Base(path), st.ModTime(), f)
}
