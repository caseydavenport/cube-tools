package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
)

func TestWithCubeRouting(t *testing.T) {
	// The registry only loads from a file, so write a temp one (mirrors
	// refresh_test.go).
	t.Chdir(t.TempDir())
	regFile := filepath.Join("data", "cubes.json")
	if err := os.MkdirAll("data", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(regFile, []byte(`{"cubes":[{"id":"polyverse","name":"Polyverse","cubecobra_id":"polyversal"}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	reg, err := cubes.Load(regFile)
	if err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("GET /api/{cube}/x", WithCube(reg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(CubeFromRequest(r)))
	})))

	cases := []struct {
		path string
		want int
	}{
		{"/api/polyverse/x", 200},
		{"/api/cc:polyversal/x", 200},
		{"/api/unknown/x", 404},
		{"/api/cc:bad..id/x", 404},
	}
	for _, c := range cases {
		req := httptest.NewRequest("GET", c.path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != c.want {
			t.Errorf("%s: status %d, want %d", c.path, rec.Code, c.want)
		}
	}
}
