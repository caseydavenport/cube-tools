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

func TestLoadCubeList_FromSnapshot(t *testing.T) {
	dir := t.TempDir()
	writeCubeFile(t, filepath.Join(dir, "polyverse", "2024-05-03", "cube-snapshot.json"), `{
		"cards": [
			{"name": "Lightning Bolt"},
			{"name": "Counterspell"},
			{"name": "Plains"},
			{"name": "Plains"}
		]
	}`)

	c, err := LoadCubeList(LoadOptions{
		DataRoot: dir,
		Cube:     "polyverse",
		Date:     "2024-05-03",
	})
	require.NoError(t, err)
	require.Equal(t, 3, len(c.Names()))
	require.Equal(t, 2, c.MaxCopies("Plains"))
	require.Equal(t, 1, c.MaxCopies("Lightning Bolt"))
}

func TestLoadCubeList_FallsBackToCubeJSON(t *testing.T) {
	dir := t.TempDir()
	writeCubeFile(t, filepath.Join(dir, "polyverse", "cube.json"), `{
		"cards": [{"name": "Brainstorm"}]
	}`)

	c, err := LoadCubeList(LoadOptions{
		DataRoot: dir,
		Cube:     "polyverse",
	})
	require.NoError(t, err)
	require.Equal(t, []string{"Brainstorm"}, c.Names())
}

func TestLoadCubeList_PicksLatestDate(t *testing.T) {
	dir := t.TempDir()
	writeCubeFile(t, filepath.Join(dir, "polyverse", "2024-01-01", "cube-snapshot.json"),
		`{"cards":[{"name":"Old Card"}]}`)
	writeCubeFile(t, filepath.Join(dir, "polyverse", "2025-12-31", "cube-snapshot.json"),
		`{"cards":[{"name":"New Card"}]}`)

	c, err := LoadCubeList(LoadOptions{
		DataRoot: dir,
		Cube:     "polyverse",
	})
	require.NoError(t, err)
	require.Equal(t, []string{"New Card"}, c.Names())
}

func TestMaxCopiesCaseInsensitiveNonASCII(t *testing.T) {
	dir := t.TempDir()
	writeCubeFile(t, filepath.Join(dir, "cube", "cube.json"), `{
		"cards": [
			{"name": "Lim-Dûl's Vault"},
			{"name": "Jötun Grunt"}
		]
	}`)
	c, err := LoadCubeList(LoadOptions{DataRoot: dir, Cube: "cube"})
	require.NoError(t, err)
	require.Equal(t, 1, c.MaxCopies("lim-dûl's vault"))
	require.Equal(t, 1, c.MaxCopies("jötun grunt"))
}

func TestLoadCubeList_NotFound(t *testing.T) {
	_, err := LoadCubeList(LoadOptions{
		DataRoot: t.TempDir(),
		Cube:     "missing",
	})
	require.Error(t, err)
}

func TestLoadCube_ParseError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cube.json")
	writeCubeFile(t, path, "{not json}")
	_, err := LoadCube(path)
	require.ErrorContains(t, err, path)
}
