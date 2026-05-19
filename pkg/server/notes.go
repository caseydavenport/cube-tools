package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/sirupsen/logrus"
)

type SaveNotesRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func SaveNotesHandler() http.Handler {
	return &saveNotesHandler{}
}

type saveNotesHandler struct{}

func (h *saveNotesHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(rw, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SaveNotesRequest
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(rw, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate path: must live under data/<cube>/ for the cube on this request,
	// and must not traverse out. The trailing separator guards against
	// lookalike prefixes like data/polyverse-evil.
	cubeID := CubeFromRequest(r)
	cleanPath := filepath.Clean(req.Path)
	prefix := filepath.Clean(filepath.Join("data", cubeID)) + string(filepath.Separator)
	if cubeID == "" || strings.Contains(req.Path, "..") || !strings.HasPrefix(cleanPath+string(filepath.Separator), prefix) {
		logrus.WithFields(logrus.Fields{"cube": cubeID, "path": req.Path}).Warn("Blocked invalid notes path")
		http.Error(rw, "Invalid path", http.StatusForbidden)
		return
	}

	// Ensure directory exists.
	dir := filepath.Dir(cleanPath)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		err = os.MkdirAll(dir, 0o755)
		if err != nil {
			logrus.WithError(err).Error("Failed to create directory")
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	err = os.WriteFile(cleanPath, []byte(req.Content), 0o644)
	if err != nil {
		logrus.WithError(err).Error("Failed to write notes file")
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
		return
	}

	logrus.WithField("path", cleanPath).Info("Saved notes")
	rw.WriteHeader(http.StatusOK)
}
