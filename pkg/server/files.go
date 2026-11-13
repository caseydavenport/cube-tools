package server

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server/httperr"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
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
		writeJSON(rw, http.StatusOK, c)
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
		if httperr.WriteStoreError(rw, err, "Failed to load cube index for "+cube) {
			return
		}
		writeJSON(rw, http.StatusOK, index)
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
		if httperr.WriteStoreError(rw, err, fmt.Sprintf("Failed to load draft log %s/%d", cube, draftID)) {
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		if _, err := rw.Write(raw); err != nil {
			logrus.WithError(err).WithField("cube", cube).Warn("Failed to write draft log response")
		}
	})
}
