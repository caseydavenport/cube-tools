package ocr

import (
	"net/http"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func CardsHandler() http.Handler { return CardsHandlerWithRoot("data") }

func CardsHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		cl, err := loadCubeForDraft(dataRoot, server.CubeFromRequest(r), draft)
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
			return
		}
		var cards []CardInfo
		for _, name := range cl.Names() {
			cards = append(cards, CardInfo{Name: name, MaxCopies: cl.MaxCopies(name), IsLand: isLandCard(name)})
		}
		writeJSON(rw, map[string]any{"cards": cards})
	})
}

// isLandCard reports whether a card's oracle type line makes it a land. A card
// with no oracle data isn't one.
func isLandCard(name string) bool {
	return strings.Contains(types.GetOracleData(name).TypeLine, "Land")
}
