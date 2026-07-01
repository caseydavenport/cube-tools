package commands

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRefreshCube(t *testing.T) {
	const body = `{
		"cards": {
			"mainboard": [
				{"details": {"name": "Brainstorm"}},
				{"details": {"name": "Lightning Bolt"}},
				{"details": {"name": ""}}
			]
		}
	}`

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/cube/api/cubeJSON/xyz", r.URL.Path)
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	old := ccBaseURL
	ccBaseURL = srv.URL
	defer func() { ccBaseURL = old }()

	// RefreshCube writes under ./data, so run from a temp dir.
	t.Chdir(t.TempDir())
	require.NoError(t, os.MkdirAll(filepath.Join("data", "testcube"), 0o755))

	_, err := RefreshCube("testcube", "xyz")
	require.NoError(t, err)

	// cube.csv is rewritten as a name-per-row list, blank names skipped.
	got, err := os.ReadFile(filepath.Join("data", "testcube", "cube.csv"))
	require.NoError(t, err)
	assert.Equal(t, "name\nBrainstorm\nLightning Bolt\n", string(got))

	_, err = os.Stat(filepath.Join("data", "testcube", "cube.json"))
	assert.NoError(t, err)
}
