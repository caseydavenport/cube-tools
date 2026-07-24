package server

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// RefreshHandler force-fetches the cube's card list from Cube Cobra and
// replaces the source's cached copy.
func RefreshHandler(src types.CubeSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := CubeFromRequest(r)
		c, err := src.Refresh(cube)
		if err != nil {
			logrus.WithError(err).Error("Failed to refresh cube from Cube Cobra")
			http.Error(rw, err.Error(), http.StatusBadGateway)
			return
		}

		rw.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(rw).Encode(map[string]any{"cards": len(c.Cards)})
	})
}
