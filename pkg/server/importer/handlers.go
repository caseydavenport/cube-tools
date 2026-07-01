package importer

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CardInfo is one cube card offered to the UI's rename autocomplete.
type CardInfo struct {
	Name      string `json:"name"`
	MaxCopies int    `json:"max_copies"`
	IsLand    bool   `json:"is_land"`
}

// writeJSON marshals v and writes it as an application/json response.
func writeJSON(rw http.ResponseWriter, v any) {
	rw.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(rw).Encode(v)
}

// validID rejects path or body values that could escape the data directory.
func validID(s string) bool {
	return s != "" && !strings.ContainsAny(s, `/\`) && !strings.Contains(s, "..")
}

// cubePath returns data/<cube>/cube.json under dataRoot.
func cubePath(dataRoot, cube string) string {
	return fmt.Sprintf("%s/%s/cube.json", dataRoot, cube)
}

// ImportCardsHandler serves the cube's card list for the import UI's rename
// autocomplete. Unlike the OCR cards endpoint it isn't scoped to a draft.
func ImportCardsHandler() http.Handler { return ImportCardsHandlerWithRoot("data") }

// ImportCardsHandlerWithRoot is ImportCardsHandler with an overridable data root.
func ImportCardsHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		cl, err := types.LoadCube(cubePath(dataRoot, cube))
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
			return
		}
		cards := []CardInfo{}
		for _, name := range cl.Names() {
			isLand := strings.Contains(types.GetOracleData(name).TypeLine, "Land")
			cards = append(cards, CardInfo{Name: name, MaxCopies: cl.MaxCopies(name), IsLand: isLand})
		}
		writeJSON(rw, map[string]any{"cards": cards})
	})
}
