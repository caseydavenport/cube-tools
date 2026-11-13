package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
)

// cubesResponse is the body of GET /api/cubes.
type cubesResponse struct {
	Cubes []cubes.Cube `json:"cubes"`
}

func TestCubesHandler_ReturnsRegistry(t *testing.T) {
	reg := mustRegistry(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/cubes", nil)
	CubesHandler(reg).ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var body cubesResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Cubes, 2)
	require.Equal(t, "polyverse", body.Cubes[0].ID)
}

func TestCubesHandler_RefusesOtherMethods(t *testing.T) {
	rec := httptest.NewRecorder()
	CubesHandler(mustRegistry(t)).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/cubes", nil))
	require.Equal(t, http.StatusMethodNotAllowed, rec.Code)
}

func mustRegistry(t *testing.T) *cubes.Registry {
	t.Helper()
	path := t.TempDir() + "/cubes.json"
	require.NoError(t, writeFile(path, `{"cubes":[{"id":"polyverse","name":"Polyverse"},{"id":"aurora","name":"Aurora"}]}`))
	r, err := cubes.Load(path)
	require.NoError(t, err)
	return r
}

func writeFile(path, body string) error {
	return os.WriteFile(path, []byte(body), 0o644)
}
