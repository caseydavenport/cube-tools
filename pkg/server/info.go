package server

import (
	"encoding/json"
	"net/http"
)

// WritableChecker reports whether a cube accepts writes.
type WritableChecker interface {
	Writable(cube string) bool
}

// CubeInfoHandler serves GET /api/{cube}/info, which tells the UI whether the
// cube can be edited so it shows or hides its write controls.
func CubeInfoHandler(store WritableChecker) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		rw.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(rw).Encode(map[string]bool{"writable": store.Writable(CubeFromRequest(r))})
	})
}
