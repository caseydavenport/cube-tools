package drafts

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestSaveMetadataRoundTrips(t *testing.T) {
	cubeDir := t.TempDir()
	d, err := Create(cubeDir, types.DraftMetadata{Date: "2026-01-02"})
	require.NoError(t, err)

	d.EventName = "Rumours Tour"
	require.NoError(t, d.SaveMetadata())

	got, err := Find(cubeDir, d.ID)
	require.NoError(t, err)
	assert.Equal(t, "Rumours Tour", got.EventName)
	assert.Equal(t, d.ID, got.ID)
}

func TestSaveMetadataLeavesNoTempFile(t *testing.T) {
	d, err := Create(t.TempDir(), types.DraftMetadata{Date: "2026-01-02"})
	require.NoError(t, err)
	require.NoError(t, d.SaveMetadata())

	entries, err := os.ReadDir(d.Dir)
	require.NoError(t, err)
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	assert.Equal(t, []string{"metadata.json"}, names)
}

func TestListSkipsUnparsableMetadata(t *testing.T) {
	cubeDir := t.TempDir()
	writeDraft(t, cubeDir, "0001_2026-01-01", types.DraftMetadata{ID: 1, Date: "2026-01-01"})
	bad := filepath.Join(cubeDir, "0002_2026-01-02")
	require.NoError(t, os.Mkdir(bad, 0o755))
	writeFile(t, filepath.Join(bad, "metadata.json"), "{not json")

	got, err := List(cubeDir)
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, 1, got[0].ID)
}

func TestListSkipsIDZero(t *testing.T) {
	cubeDir := t.TempDir()
	writeDraft(t, cubeDir, "0001_2026-01-01", types.DraftMetadata{ID: 1, Date: "2026-01-01"})
	writeDraft(t, cubeDir, "0000_2026-01-02", types.DraftMetadata{Date: "2026-01-02"})

	got, err := List(cubeDir)
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, 1, got[0].ID)
}
