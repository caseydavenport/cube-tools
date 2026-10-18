package drafts

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestLog(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	_, err := draft.Log()
	assert.ErrorIs(t, err, ErrNotFound)
	assert.False(t, draft.HasLog())

	writeFile(t, filepath.Join(draft.Dir, "draft-log.json"), `{"picks":[]}`)
	got, err := draft.Log()
	require.NoError(t, err)
	assert.JSONEq(t, `{"picks":[]}`, string(got))
	assert.True(t, draft.HasLog())
}

func TestReport(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	assert.Equal(t, "", draft.Report())

	writeFile(t, filepath.Join(draft.Dir, "REPORT.md"), "markdown report")
	assert.Equal(t, "", draft.Report(), "only REPORT is read")

	writeFile(t, filepath.Join(draft.Dir, "REPORT"), "Hotel California")
	assert.Equal(t, "Hotel California", draft.Report())
}

func TestSnapshotRoundTrip(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	assert.False(t, draft.HasSnapshot())
	_, err := draft.Snapshot()
	assert.ErrorIs(t, err, ErrNotFound)

	want := &types.Cube{Cards: []types.Card{{Name: "Lightning Bolt"}, {Name: "Plains"}, {Name: "Plains"}}}
	require.NoError(t, draft.SaveSnapshot(want))
	assert.True(t, draft.HasSnapshot())

	got, err := draft.Snapshot()
	require.NoError(t, err)
	assert.Equal(t, want.Names(), got.Names())
	assert.Equal(t, 2, got.MaxCopies("Plains"))
}

func TestLatestSnapshotPicksHighestID(t *testing.T) {
	cubeDir := t.TempDir()
	for id := 1; id <= 12; id++ {
		d, err := Create(cubeDir, types.DraftMetadata{Date: fmt.Sprintf("2026-01-%02d", id)})
		require.NoError(t, err)
		if id == 2 || id == 11 {
			cube := &types.Cube{Cards: []types.Card{{Name: fmt.Sprintf("Card from draft %d", id)}}}
			require.NoError(t, d.SaveSnapshot(cube))
		}
	}

	got, ok, err := LatestSnapshot(cubeDir)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, []string{"Card from draft 11"}, got.Names())
}

func TestLatestSnapshotNone(t *testing.T) {
	cubeDir := t.TempDir()
	_, err := Create(cubeDir, types.DraftMetadata{Date: "2026-01-01"})
	require.NoError(t, err)

	_, ok, err := LatestSnapshot(cubeDir)
	require.NoError(t, err)
	assert.False(t, ok)

	_, ok, err = LatestSnapshot(filepath.Join(cubeDir, "missing"))
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestCopySourceKeepsFileInsideDraft(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	inside := filepath.Join(draft.Dir, "4-mainboard.txt")
	writeFile(t, inside, "1 Lightning Bolt")

	got, err := draft.CopySource(inside, 4, "-mainboard")
	require.NoError(t, err)
	assert.Equal(t, inside, got)
}

func TestCopySourceCopiesOutsideFile(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	src := filepath.Join(t.TempDir(), "ozzy.txt")
	writeFile(t, src, "1 Lightning Bolt")

	got, err := draft.CopySource(src, 4, "-mainboard")
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(draft.Dir, "4-mainboard.txt"), got)
	contents, err := os.ReadFile(got)
	require.NoError(t, err)
	assert.Equal(t, "1 Lightning Bolt", string(contents))
}
