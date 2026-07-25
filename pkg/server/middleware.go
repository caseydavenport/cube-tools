package server

import (
	"context"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
)

type ctxKey int

const cubeKey ctxKey = 0

// ContextWithCube returns ctx with the cube id attached, the same way WithCube
// does. Exported for handlers in subpackages and for tests.
func ContextWithCube(ctx context.Context, cube string) context.Context {
	return context.WithValue(ctx, cubeKey, cube)
}

// WithCube validates the {cube} path param and stashes the cube id in the
// request context. A registry cube must be in the registry; a cc: cube must
// carry a syntactically valid CubeCobra id. Handlers retrieve it via
// CubeFromRequest.
func WithCube(reg *cubes.Registry, h http.Handler) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		id := r.PathValue("cube")
		if id == "" {
			http.NotFound(rw, r)
			return
		}
		if cubes.IsCubeCobra(id) {
			if !cubes.ValidCubeCobraID(cubes.CubeCobraID(id)) {
				http.NotFound(rw, r)
				return
			}
		} else if !reg.Has(id) {
			http.NotFound(rw, r)
			return
		}
		ctx := ContextWithCube(r.Context(), id)
		h.ServeHTTP(rw, r.WithContext(ctx))
	})
}

// CubeFromRequest returns the validated cube ID for this request.
func CubeFromRequest(r *http.Request) string {
	v, _ := r.Context().Value(cubeKey).(string)
	return v
}
