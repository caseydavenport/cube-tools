package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server/httperr"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// CubeInfo describes what a cube can be used for: whether it can be edited and
// which kinds of play data it holds. The UI dims pages and hides columns from it.
type CubeInfo struct {
	Writable   bool `json:"writable"`
	Decks      bool `json:"decks"`
	Results    bool `json:"results"`
	PickLogs   bool `json:"pick_logs"`
	Archetypes bool `json:"archetypes"`
	Sideboards bool `json:"sideboards"`
}

// CubeInfoHandler serves GET /api/{cube}/info, which tells the UI whether the
// cube can be edited and which kinds of data it has, so it can show or hide
// write controls and dim pages the cube can't fill.
func CubeInfoHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		info, err := cubeInfo(store, cube)
		if httperr.WriteStoreError(rw, err, "Failed to load cube info") {
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(rw).Encode(info); err != nil {
			logrus.WithError(err).WithField("cube", cube).Warn("Failed to write cube info response")
		}
	})
}

// cubeInfo reads every deck and the draft index to learn which kinds of data the
// cube holds. A backend that keeps no draft index has no pick logs.
func cubeInfo(store *storage.Store, cube string) (CubeInfo, error) {
	info := CubeInfo{Writable: store.Writable(cube)}
	decks, err := store.List(cube, &storage.DecksRequest{})
	if err != nil {
		return CubeInfo{}, err
	}
	info.Decks = len(decks) > 0
	for _, d := range decks {
		if len(d.Matches) > 0 || len(d.Games) > 0 {
			info.Results = true
		}
		if d.Macro() != "" {
			info.Archetypes = true
		}
		if len(d.Sideboard) > 0 {
			info.Sideboards = true
		}
	}

	idx, err := store.Index(cube)
	if errors.Is(err, storage.ErrUnsupported) {
		return info, nil
	}
	if err != nil {
		return CubeInfo{}, err
	}
	for _, draft := range idx.Drafts {
		if draft.HasLog {
			info.PickLogs = true
		}
	}
	return info, nil
}
