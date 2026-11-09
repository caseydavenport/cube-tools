package importer

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// writeJSON marshals v and writes it as an application/json response.
func writeJSON(rw http.ResponseWriter, v any) {
	rw.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(rw).Encode(v)
}

// ImportCardsHandler serves the cube's card list for the import UI's rename
// autocomplete. Unlike the OCR cards endpoint it isn't scoped to a draft.
func ImportCardsHandler(src types.CubeSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		cl, err := src.Current(cube)
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusServiceUnavailable)
			return
		}
		writeJSON(rw, map[string]any{"cards": server.CubeCards(cl)})
	})
}
