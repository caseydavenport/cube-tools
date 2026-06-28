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
		cube := server.CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		if cube == "" || draftID == "" || strings.ContainsAny(draftID, `/\`) || strings.Contains(draftID, "..") {
			http.NotFound(rw, r)
			return
		}
		date := ""
		if len(draftID) >= 10 {
			date = draftID[:10]
		}
		cl, err := types.LoadCubeList(types.LoadOptions{DataRoot: dataRoot, Cube: cube, Date: date})
		if err != nil {
			// Fall back to latest snapshot when the exact date has none.
			cl, err = types.LoadCubeList(types.LoadOptions{DataRoot: dataRoot, Cube: cube})
			if err != nil {
				http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
		var cards []CardInfo
		for _, name := range cl.Names() {
			isLand := strings.Contains(types.GetOracleData(name).TypeLine, "Land")
			cards = append(cards, CardInfo{Name: name, MaxCopies: cl.MaxCopies(name), IsLand: isLand})
		}
		writeJSON(rw, map[string]any{"cards": cards})
	})
}
