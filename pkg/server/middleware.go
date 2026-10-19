package server

import (
	"context"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/server/httperr"
	"github.com/caseydavenport/cube-tools/pkg/storage"
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

// WritableChecker reports whether a cube accepts writes. *storage.Store
// satisfies it.
type WritableChecker interface {
	Writable(cube string) bool
}

// RequireWritable refuses the request with 403 when the request's cube is
// read-only, and otherwise passes it to h. It guards handlers that write under
// data/<cube> directly instead of through the store, which would otherwise
// skip the store's read-only check. Wrap it inside WithCube so the cube is set.
func RequireWritable(wc WritableChecker, h http.Handler) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if !wc.Writable(CubeFromRequest(r)) {
			httperr.WriteStoreError(rw, storage.ErrReadOnly, "read-only cube")
			return
		}
		h.ServeHTTP(rw, r)
	})
}

// CubeFromRequest returns the validated cube ID for this request.
func CubeFromRequest(r *http.Request) string {
	v, _ := r.Context().Value(cubeKey).(string)
	return v
}
