package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
)

type SaveNotesRequest struct {
	DraftID string `json:"draft_id"`
	ID      string `json:"id"`
	Content string `json:"content"`
}

// SaveNotesHandler persists a deck's notes through the store, which routes to
// whatever backend is active.
func SaveNotesHandler(store *storage.Store) http.Handler {
	return &saveNotesHandler{store: store}
}

type saveNotesHandler struct {
	store *storage.Store
}

func (h *saveNotesHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(rw, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SaveNotesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(rw, "Invalid request", http.StatusBadRequest)
		return
	}

	cube := CubeFromRequest(r)
	if cube == "" || req.DraftID == "" || req.ID == "" {
		http.Error(rw, "Missing required field", http.StatusBadRequest)
		return
	}

	if err := h.store.PutNotes(cube, req.DraftID, req.ID, req.Content); err != nil {
		if errors.Is(err, storage.ErrUnsupported) {
			http.Error(rw, "Not supported", http.StatusNotImplemented)
			return
		}
		logrus.WithError(err).WithFields(logrus.Fields{"cube": cube, "draft_id": req.DraftID, "id": req.ID}).Error("Failed to save notes")
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
		return
	}

	logrus.WithFields(logrus.Fields{"cube": cube, "draft_id": req.DraftID, "id": req.ID}).Info("Saved notes")
	rw.WriteHeader(http.StatusOK)
}
