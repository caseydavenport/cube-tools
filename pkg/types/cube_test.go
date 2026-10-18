package types

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func writeCubeFile(t *testing.T, path, body string) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	require.NoError(t, os.WriteFile(path, []byte(body), 0o644))
}

func TestLoadCubeCountsCopies(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cube-snapshot.json")
	writeCubeFile(t, path, `{
		"cards": [
			{"name": "Lightning Bolt"},
			{"name": "Counterspell"},
			{"name": "Plains"},
			{"name": "Plains"}
		]
	}`)

	c, err := LoadCube(path)
	require.NoError(t, err)
	require.Equal(t, 3, len(c.Names()))
	require.Equal(t, 2, c.MaxCopies("Plains"))
	require.Equal(t, 1, c.MaxCopies("Lightning Bolt"))
}

func TestMaxCopiesCaseInsensitiveNonASCII(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cube-snapshot.json")
	writeCubeFile(t, path, `{
		"cards": [
			{"name": "Lim-Dûl's Vault"},
			{"name": "Jötun Grunt"}
		]
	}`)
	c, err := LoadCube(path)
	require.NoError(t, err)
	require.Equal(t, 1, c.MaxCopies("lim-dûl's vault"))
	require.Equal(t, 1, c.MaxCopies("jötun grunt"))
}

func TestLoadCube_ParseError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cube.json")
	writeCubeFile(t, path, "{not json}")
	_, err := LoadCube(path)
	require.ErrorContains(t, err, path)
}
