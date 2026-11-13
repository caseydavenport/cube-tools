package server

import (
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
)

// CubesHandler serves GET /api/cubes: the registry's cubes, as {"cubes": [...]}.
// Any other method gets a 405.
func CubesHandler(reg *cubes.Registry) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(rw, http.StatusOK, map[string]any{"cubes": reg.List()})
	})
}
