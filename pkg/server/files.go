package server

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"strconv"

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
		draftID, err := strconv.Atoi(r.PathValue("draft_id"))
		if cube == "" || err != nil || draftID < 1 {
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
