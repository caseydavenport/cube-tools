package server

import (
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/types"
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
		writeJSON(rw, http.StatusOK, map[string]any{"cards": len(c.Cards)})
	})
}
