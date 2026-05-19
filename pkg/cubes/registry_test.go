package cubes

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func writeRegistry(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "cubes.json")
	require.NoError(t, os.WriteFile(path, []byte(body), 0o644))
	return path
}

func TestLoad_Valid(t *testing.T) {
	path := writeRegistry(t, `{"cubes":[{"id":"polyverse","name":"Polyverse","description":"home"},{"id":"aurora","name":"Aurora","description":"aurora"}]}`)
	r, err := Load(path)
	require.NoError(t, err)
	require.Len(t, r.List(), 2)
	require.True(t, r.Has("polyverse"))
	require.True(t, r.Has("aurora"))
	require.False(t, r.Has("nope"))
}

func TestLoad_MissingFile(t *testing.T) {
	_, err := Load("/does/not/exist.json")
	require.Error(t, err)
}

func TestLoad_Malformed(t *testing.T) {
	path := writeRegistry(t, `not json`)
	_, err := Load(path)
	require.Error(t, err)
}

func TestLoad_RejectsEmptyID(t *testing.T) {
	path := writeRegistry(t, `{"cubes":[{"id":"","name":"x"}]}`)
	_, err := Load(path)
	require.Error(t, err)
}

func TestLoad_RejectsDuplicateID(t *testing.T) {
	path := writeRegistry(t, `{"cubes":[{"id":"a","name":"A"},{"id":"a","name":"A2"}]}`)
	_, err := Load(path)
	require.Error(t, err)
}
