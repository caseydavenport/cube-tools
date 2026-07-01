package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
)

func TestRefreshHandlerNoCubeCobraID(t *testing.T) {
	t.Chdir(t.TempDir())
	regFile := filepath.Join("data", "cubes.json")
	if err := os.MkdirAll("data", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(regFile, []byte(`{"cubes":[{"id":"plain","name":"Plain"}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	reg, err := cubes.Load(regFile)
	if err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("POST /api/{cube}/refresh", WithCube(reg, RefreshHandler(reg)))

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/plain/refresh", nil))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
