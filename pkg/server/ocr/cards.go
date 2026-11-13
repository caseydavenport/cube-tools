package ocr

import (
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server"
)

// cardsResponse is the body CardsHandler writes.
type cardsResponse struct {
	Cards []server.CubeCard `json:"cards"`
}

// CardsHandler serves the card list of the cube a draft was played with, for
// the photo review's card-name search.
func CardsHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		cube, err := loadCubeForDraft(dataRoot, server.CubeFromRequest(r), draft)
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(rw, cardsResponse{Cards: server.CubeCards(cube)})
	})
}
