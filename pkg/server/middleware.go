package server

import (
	"context"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
)

type ctxKey int

const cubeKey ctxKey = 0

// WithCube validates the {cube} path param against the registry and stashes the
// cube ID in the request context. Handlers retrieve it via CubeFromRequest.
func WithCube(reg *cubes.Registry, h http.Handler) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		id := r.PathValue("cube")
		if id == "" || !reg.Has(id) {
			http.NotFound(rw, r)
			return
		}
		ctx := context.WithValue(r.Context(), cubeKey, id)
		h.ServeHTTP(rw, r.WithContext(ctx))
	})
}

// CubeFromRequest returns the validated cube ID for this request.
func CubeFromRequest(r *http.Request) string {
	v, _ := r.Context().Value(cubeKey).(string)
	return v
}
