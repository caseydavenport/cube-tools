package importer

import (
	"encoding/json"
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// writeJSON writes v as an application/json response. A value that can't be
// marshaled gets a 500, and a failed write is logged.
func writeJSON(rw http.ResponseWriter, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		logrus.WithError(err).Error("could not marshal import response")
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Warn("could not write import response")
	}
}

// cardsResponse is the body of GET /api/{cube}/import/cards.
type cardsResponse struct {
	Cards []server.CubeCard `json:"cards"`
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
		writeJSON(rw, cardsResponse{Cards: server.CubeCards(cl)})
	})
}
