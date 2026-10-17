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
	writeCubeFile(t, filepath.Join(dir, "polyverse", "0003_2024-05-03", "cube-snapshot.json"), `{
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
		DraftDir: filepath.Join(dir, "polyverse", "0003_2024-05-03"),
	})
	require.NoError(t, err)
	require.Equal(t, 3, len(c.Names()))
	require.Equal(t, 2, c.MaxCopies("Plains"))
	require.Equal(t, 1, c.MaxCopies("Lightning Bolt"))
}

// fakeCubeSource serves a fixed cube list, standing in for the live provider.
type fakeCubeSource struct{ c *Cube }

func (f fakeCubeSource) Current(string) (*Cube, error) { return f.c, nil }
func (f fakeCubeSource) Refresh(string) (*Cube, error) { return f.c, nil }

func TestLoadCubeList_FallsBackToLiveCube(t *testing.T) {
	c, err := LoadCubeList(LoadOptions{
		DataRoot: t.TempDir(),
		Cube:     "polyverse",
		Source:   fakeCubeSource{c: &Cube{Cards: []Card{{Name: "Brainstorm"}}}},
	})
	require.NoError(t, err)
	require.Equal(t, []string{"Brainstorm"}, c.Names())
}

func TestLoadCubeList_DraftDirWithoutSnapshot(t *testing.T) {
	dir := t.TempDir()
	_, err := LoadCubeList(LoadOptions{
		DataRoot: dir,
		Cube:     "polyverse",
		DraftDir: filepath.Join(dir, "polyverse", "0001_2024-01-01"),
		Source:   fakeCubeSource{c: &Cube{Cards: []Card{{Name: "Brainstorm"}}}},
	})
	require.Error(t, err)
}

func TestLoadCubeList_PicksLatestDraft(t *testing.T) {
	dir := t.TempDir()
	writeCubeFile(t, filepath.Join(dir, "polyverse", "0002_2026-01-01", "cube-snapshot.json"), `{"cards":[{"name":"Old Card"}]}`)
	writeCubeFile(t, filepath.Join(dir, "polyverse", "0010_2025-12-01", "cube-snapshot.json"), `{"cards":[{"name":"New Card"}]}`)
	writeCubeFile(t, filepath.Join(dir, "polyverse", "2027-01-01_local_1", "cube-snapshot.json"), `{"cards":[{"name":"Old Format"}]}`)

	c, err := LoadCubeList(LoadOptions{
		DataRoot: dir,
		Cube:     "polyverse",
	})
	require.NoError(t, err)
	require.Equal(t, []string{"New Card"}, c.Names())
}

func TestMaxCopiesCaseInsensitiveNonASCII(t *testing.T) {
	dir := t.TempDir()
	writeCubeFile(t, filepath.Join(dir, "cube", "0001_2024-01-01", "cube-snapshot.json"), `{
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
