package server

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// CubeContentHandler serves the cube's current card list, sourced live from
// Cube Cobra via the injected source rather than a file on disk.
func CubeContentHandler(src types.CubeSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		c, err := src.Current(cube)
		if err != nil {
			logrus.WithError(err).WithField("cube", cube).Error("Failed to load cube from Cube Cobra")
			http.Error(rw, err.Error(), http.StatusServiceUnavailable)
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(rw).Encode(c)
	})
}

// CubeIndexHandler serves the cube's path-free draft/deck index via the store.
func CubeIndexHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		index, err := store.Index(cube)
		if err != nil {
			// The file backend returns a raw fs.ErrNotExist-wrapping error when
			// index.json is missing, matching Overview.js's empty-cube path.
			switch {
			case errors.Is(err, fs.ErrNotExist):
				http.NotFound(rw, r)
			case errors.Is(err, storage.ErrUnsupported):
				http.Error(rw, "Not supported", http.StatusNotImplemented)
			default:
				logrus.WithError(err).WithField("cube", cube).Error("Failed to load cube index")
				http.Error(rw, "Internal server error", http.StatusInternalServerError)
			}
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(rw).Encode(index)
	})
}

// DraftLogHandler serves a draft's raw log via the store.
func DraftLogHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		if cube == "" || draftID == "" {
			http.NotFound(rw, r)
			return
		}
		raw, err := store.GetDraftLog(cube, draftID)
		if err != nil {
			switch {
			case errors.Is(err, storage.ErrDeckNotFound):
				http.NotFound(rw, r)
			case errors.Is(err, storage.ErrUnsupported):
				http.Error(rw, "Not supported", http.StatusNotImplemented)
			default:
				logrus.WithError(err).WithFields(logrus.Fields{"cube": cube, "draft_id": draftID}).Error("Failed to load draft log")
				http.Error(rw, "Internal server error", http.StatusInternalServerError)
			}
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		_, _ = rw.Write(raw)
	})
}

// NotesHandler serves a deck's notes via ?draft_id=...&id=..., writing an
// empty body with 200 when none have been saved yet, matching the previous
// client behavior that tolerated missing notes.
func NotesHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		draftID := r.URL.Query().Get("draft_id")
		id := r.URL.Query().Get("id")
		if cube == "" || draftID == "" || id == "" {
			http.Error(rw, "Missing required field", http.StatusBadRequest)
			return
		}
		content, err := store.GetNotes(cube, draftID, id)
		if err != nil {
			if errors.Is(err, storage.ErrUnsupported) {
				http.Error(rw, "Not supported", http.StatusNotImplemented)
				return
			}
			logrus.WithError(err).WithFields(logrus.Fields{"cube": cube, "draft_id": draftID, "id": id}).Error("Failed to load notes")
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		_, _ = rw.Write([]byte(content))
	})
}
