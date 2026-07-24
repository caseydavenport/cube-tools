package commands

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

const testCubeJSON = `{
	"cards": {
		"mainboard": [
			{"details": {"name": "Monastery Mentor", "elo": 1500}},
			{"details": {"name": "Snapcaster Mage", "elo": 1600}},
			{"details": {"name": ""}}
		]
	}
}`

func TestFetchCube(t *testing.T) {
	require.NoError(t, types.LoadOracleData("testdata/oracle-mini.json"))

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/cube/api/cubeJSON/xyz", r.URL.Path)
		_, _ = w.Write([]byte(testCubeJSON))
	}))
	defer srv.Close()

	cube, err := FetchCube(srv.URL, "xyz")
	require.NoError(t, err)

	// The blank-named card is dropped; the other two hydrate from oracle data
	// and carry their CubeCobra draft Elo.
	require.Equal(t, []string{"Monastery Mentor", "Snapcaster Mage"}, cube.Names())
	require.Equal(t, 1500, cube.Cards[0].DraftELO)
	require.Equal(t, 1600, cube.Cards[1].DraftELO)
}

func TestCubeProviderCachesAndRefreshes(t *testing.T) {
	require.NoError(t, types.LoadOracleData("testdata/oracle-mini.json"))

	var fetches atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetches.Add(1)
		_, _ = w.Write([]byte(testCubeJSON))
	}))
	defer srv.Close()

	old := ccBaseURL
	ccBaseURL = srv.URL
	defer func() { ccBaseURL = old }()

	dir := t.TempDir()
	regPath := filepath.Join(dir, "cubes.json")
	require.NoError(t, os.WriteFile(regPath, []byte(`{"cubes":[{"id":"testcube","name":"Test","cubecobra_id":"xyz"}]}`), 0o644))
	reg, err := cubes.Load(regPath)
	require.NoError(t, err)

	p := NewCubeProvider(reg)

	// First Current fetches; the second is served from cache.
	_, err = p.Current("testcube")
	require.NoError(t, err)
	_, err = p.Current("testcube")
	require.NoError(t, err)
	require.Equal(t, int32(1), fetches.Load())

	// Refresh always re-fetches.
	_, err = p.Refresh("testcube")
	require.NoError(t, err)
	require.Equal(t, int32(2), fetches.Load())
}
