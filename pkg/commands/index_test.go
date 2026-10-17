package commands

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestIndexMissingCubeReturnsError(t *testing.T) {
	// Point the working dir at a tree with no data/<cube> directory; Index
	// should return an error rather than exit the process.
	t.Chdir(t.TempDir())
	if err := Index("nope"); err == nil {
		t.Fatal("expected error when the drafts directory is missing")
	}
}

func TestIndexBuildsFromDraftMetadata(t *testing.T) {
	t.Chdir(t.TempDir())
	cubeDir := filepath.Join("data", "conf")
	for _, m := range []types.DraftMetadata{
		{ID: 2, Date: "2024-01-01"},
		{ID: 1, Date: "2024-02-01"},
	} {
		dir := filepath.Join(cubeDir, drafts.DirName(m.ID, m.Date))
		require.NoError(t, os.MkdirAll(dir, 0o755))
		require.NoError(t, m.Save(dir))
		d := types.NewDeck()
		d.ID = 1
		d.Metadata.DraftID = m.ID
		require.NoError(t, d.Save(drafts.DeckPath(dir, 1)))
	}

	require.NoError(t, Index("conf"))
	raw, err := os.ReadFile(filepath.Join(cubeDir, "index.json"))
	require.NoError(t, err)
	var idx MainIndex
	require.NoError(t, json.Unmarshal(raw, &idx))

	require.Len(t, idx.Drafts, 2)
	require.Equal(t, 2, idx.Drafts[0].DraftID)
	require.Equal(t, "2024-01-01", idx.Drafts[0].Date)
	require.Equal(t, filepath.Join(cubeDir, "0002_2024-01-01"), idx.Drafts[0].Path)
	require.Equal(t, []IndexedDeck{{Path: filepath.Join(cubeDir, "0002_2024-01-01", "1.json")}}, idx.Drafts[0].Decks)
	require.Equal(t, 1, idx.Drafts[1].DraftID)
}
