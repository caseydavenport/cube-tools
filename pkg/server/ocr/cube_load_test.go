package ocr

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// fixedCubeSource serves one cube list, standing in for the live provider.
type fixedCubeSource struct {
	cube *types.Cube
}

// Current returns the fixed cube list.
func (f fixedCubeSource) Current(string) (*types.Cube, error) {
	return f.cube, nil
}

// Refresh returns the fixed cube list.
func (f fixedCubeSource) Refresh(string) (*types.Cube, error) {
	return f.cube, nil
}

// withCubeSource swaps the live cube source for the length of a test.
func withCubeSource(t *testing.T, src types.CubeSource) {
	t.Helper()
	old := cubeSource
	cubeSource = src
	t.Cleanup(func() { cubeSource = old })
}

// cubeOf builds a cube list holding one copy of each named card.
func cubeOf(names ...string) *types.Cube {
	c := &types.Cube{}
	for _, n := range names {
		c.Cards = append(c.Cards, types.Card{Name: n})
	}
	return c
}

func TestLoadCubeForDraftPrefersOwnSnapshot(t *testing.T) {
	root := t.TempDir()
	withCubeSource(t, fixedCubeSource{cube: cubeOf("Live Card")})
	older := newDraft(t, root, types.DraftMetadata{})
	require.NoError(t, older.SaveSnapshot(cubeOf("Own Card")))
	newer := newDraft(t, root, types.DraftMetadata{})
	require.NoError(t, newer.SaveSnapshot(cubeOf("Newer Card")))

	got, err := loadCubeForDraft(root, "polyverse", older)
	require.NoError(t, err)
	assert.Equal(t, []string{"Own Card"}, got.Names())
}

func TestLoadCubeForDraftFallsBackToLatestSnapshot(t *testing.T) {
	root := t.TempDir()
	withCubeSource(t, fixedCubeSource{cube: cubeOf("Live Card")})
	withSnap := newDraft(t, root, types.DraftMetadata{})
	require.NoError(t, withSnap.SaveSnapshot(cubeOf("Latest Card")))
	bare := newDraft(t, root, types.DraftMetadata{})

	got, err := loadCubeForDraft(root, "polyverse", bare)
	require.NoError(t, err)
	assert.Equal(t, []string{"Latest Card"}, got.Names())
}

func TestLoadCubeForDraftFallsBackToLiveSource(t *testing.T) {
	root := t.TempDir()
	withCubeSource(t, fixedCubeSource{cube: cubeOf("Live Card")})
	bare := newDraft(t, root, types.DraftMetadata{})

	got, err := loadCubeForDraft(root, "polyverse", bare)
	require.NoError(t, err)
	assert.Equal(t, []string{"Live Card"}, got.Names())
}

func TestLoadCubeForDraftErrorsWithNothing(t *testing.T) {
	root := t.TempDir()
	withCubeSource(t, nil)
	bare := newDraft(t, root, types.DraftMetadata{})

	_, err := loadCubeForDraft(root, "polyverse", bare)
	assert.ErrorContains(t, err, "polyverse")
}
