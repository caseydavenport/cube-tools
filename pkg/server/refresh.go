package server

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/sirupsen/logrus"
)

// RefreshHandler rebuilds the cube's card list from its Cube Cobra source.
func RefreshHandler(reg *cubes.Registry) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		meta, ok := reg.Get(cube)
		if !ok || meta.CubeCobraID == "" {
			http.Error(rw, "cube has no Cube Cobra id", http.StatusBadRequest)
			return
		}

		n, err := commands.RefreshCube(cube, meta.CubeCobraID)
		if err != nil {
			logrus.WithError(err).Error("Failed to refresh cube from Cube Cobra")
			http.Error(rw, err.Error(), http.StatusBadGateway)
			return
		}

		rw.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(rw).Encode(map[string]any{"cards": n})
	})
}
