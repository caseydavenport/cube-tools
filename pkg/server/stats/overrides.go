package stats

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/httperr"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// GetOverridesHandler serves GET /api/{cube}/package-overrides: the packages
// the cube forces on or off regardless of the relevance line. Both lists are
// always present, empty when the cube forces nothing.
func GetOverridesHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		ov, err := store.GetOverrides(server.CubeFromRequest(r))
		if httperr.WriteStoreError(rw, err, "could not read package overrides") {
			return
		}
		if ov.On == nil {
			ov.On = []string{}
		}
		if ov.Off == nil {
			ov.Off = []string{}
		}
		writeJSON(rw, ov, "package overrides")
	})
}

// SaveOverridesHandler serves POST /api/{cube}/package-overrides, replacing
// the cube's forced packages with the body's. A cube that can't be written,
// such as a CubeCobra cube, gets a 403.
func SaveOverridesHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		var ov design.PackageOverrides
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		if err := dec.Decode(&ov); err != nil {
			http.Error(rw, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
			return
		}
		cubeID := server.CubeFromRequest(r)
		if httperr.WriteStoreError(rw, store.PutOverrides(cubeID, ov), "could not save package overrides for "+cubeID) {
			return
		}
		rw.WriteHeader(http.StatusOK)
	})
}
