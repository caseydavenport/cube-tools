package server

import (
	"encoding/json"
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// CubeInfoHandler serves GET /api/{cube}/info, which tells the UI whether the
// cube can be edited so it shows or hides its write controls.
func CubeInfoHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		rw.Header().Set("Content-Type", "application/json")
		cube := CubeFromRequest(r)
		if err := json.NewEncoder(rw).Encode(map[string]bool{"writable": store.Writable(cube)}); err != nil {
			logrus.WithError(err).WithField("cube", cube).Warn("Failed to write cube info response")
		}
	})
}
