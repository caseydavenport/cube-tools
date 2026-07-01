package importer

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CheckRequest carries already-parsed decks to re-validate against the cube
// after inline edits in the review grid.
type CheckRequest struct {
	Decks []ParsedDeck `json:"decks"`
}

// CheckHandler re-runs the consistency check on edited decks.
func CheckHandler() http.Handler { return CheckHandlerWithRoot("data") }

// CheckHandlerWithRoot is CheckHandler with an overridable data root.
func CheckHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		var req CheckRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "invalid request", http.StatusBadRequest)
			return
		}
		cl, err := types.LoadCube(cubePath(dataRoot, cube))
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(rw, CheckConsistency(cl, req.Decks))
	})
}
