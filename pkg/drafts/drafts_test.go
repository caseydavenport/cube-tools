package drafts

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	require.NoError(t, os.WriteFile(path, []byte(content), 0o644))
}

func writeDeck(t *testing.T, path string, id int) {
	t.Helper()
	d := types.NewDeck()
	d.ID = id
	d.Player = filepath.Base(path)
	require.NoError(t, d.Save(path))
}

func TestCreateAssignsNextIDAndDir(t *testing.T) {
	cubeDir := t.TempDir()

	first, err := Create(cubeDir, types.DraftMetadata{Date: "2026-01-02", EventName: "Local", EventCode: "local"})
	require.NoError(t, err)
	assert.Equal(t, 1, first.ID)
	assert.Equal(t, filepath.Join(cubeDir, "0001_2026-01-02"), first.Dir)

	meta, err := loadMetadata(first.Dir)
	require.NoError(t, err)
	assert.Equal(t, types.DraftMetadata{ID: 1, Date: "2026-01-02", EventName: "Local", EventCode: "local"}, *meta)

	second, err := Create(cubeDir, types.DraftMetadata{Date: "2025-12-31"})
	require.NoError(t, err)
	assert.Equal(t, 2, second.ID)
	assert.Equal(t, filepath.Join(cubeDir, "0002_2025-12-31"), second.Dir)
}

func TestCreateRequiresDate(t *testing.T) {
	_, err := Create(t.TempDir(), types.DraftMetadata{EventName: "No date"})
	assert.Error(t, err)
}

func TestCreateRejectsMalformedDate(t *testing.T) {
	cubeDir := filepath.Join(t.TempDir(), "cube")
	for _, date := range []string{"../escape", "2026-1-2", "2026-01-02/x"} {
		_, err := Create(cubeDir, types.DraftMetadata{Date: date})
		assert.Error(t, err, date)
	}
	entries, err := os.ReadDir(filepath.Dir(cubeDir))
	require.NoError(t, err)
	assert.Len(t, entries, 0, "nothing should be created")
}

// writeDraft writes a draft directory with the given metadata.
func writeDraft(t *testing.T, cubeDir, name string, meta types.DraftMetadata) {
	t.Helper()
	dir := filepath.Join(cubeDir, name)
	require.NoError(t, os.MkdirAll(dir, 0o755))
	require.NoError(t, Draft{Dir: dir, DraftMetadata: meta}.SaveMetadata())
}

func TestListSortsByDateThenID(t *testing.T) {
	cubeDir := t.TempDir()
	writeDraft(t, cubeDir, "0003_2026-01-01", types.DraftMetadata{ID: 3, Date: "2026-01-01"})
	writeDraft(t, cubeDir, "0001_2026-02-01", types.DraftMetadata{ID: 1, Date: "2026-02-01"})
	writeDraft(t, cubeDir, "0002_2026-01-01", types.DraftMetadata{ID: 2, Date: "2026-01-01"})
	writeDraft(t, cubeDir, "2023-01-01_local_1", types.DraftMetadata{EventName: "old format"})
	require.NoError(t, os.MkdirAll(filepath.Join(cubeDir, "no-metadata"), 0o755))
	writeFile(t, filepath.Join(cubeDir, "index.json"), "{}")

	got, err := List(cubeDir)
	require.NoError(t, err)
	var ids []int
	for _, d := range got {
		ids = append(ids, d.ID)
	}
	assert.Equal(t, []int{2, 3, 1}, ids)
	assert.Equal(t, filepath.Join(cubeDir, "0002_2026-01-01"), got[0].Dir)

	missing, err := List(filepath.Join(cubeDir, "nope"))
	require.NoError(t, err)
	assert.Empty(t, missing)
}

func TestFind(t *testing.T) {
	cubeDir := t.TempDir()
	writeDraft(t, cubeDir, "0007_2026-01-01", types.DraftMetadata{ID: 7, Date: "2026-01-01", EventCode: "bcp26"})

	got, err := Find(cubeDir, 7)
	require.NoError(t, err)
	assert.Equal(t, "bcp26", got.EventCode)

	_, err = Find(cubeDir, 8)
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestDirName(t *testing.T) {
	assert.Equal(t, "0042_2026-10-13", DirName(42, "2026-10-13"))
}

func TestCreateConcurrentGetsUniqueIDs(t *testing.T) {
	cubeDir := t.TempDir()
	const n = 20
	ids := make(chan int, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			d, err := Create(cubeDir, types.DraftMetadata{Date: fmt.Sprintf("2026-01-%02d", i+1)})
			assert.NoError(t, err)
			ids <- d.ID
		}()
	}
	wg.Wait()
	close(ids)
	seen := map[int]bool{}
	for id := range ids {
		assert.False(t, seen[id], "id %d handed out twice", id)
		seen[id] = true
	}
	assert.Len(t, seen, n)
}

func TestCreateNeverReusesAnOrphanedDirsID(t *testing.T) {
	cubeDir := t.TempDir()
	writeDraft(t, cubeDir, "0001_2026-01-01", types.DraftMetadata{ID: 1, Date: "2026-01-01"})

	// A crash between mkdir and writing metadata leaves a numbered dir with no id.
	require.NoError(t, os.Mkdir(filepath.Join(cubeDir, "0005_2026-01-02"), 0o755))

	d, err := Create(cubeDir, types.DraftMetadata{Date: "2026-01-03"})
	require.NoError(t, err)
	assert.Equal(t, 6, d.ID)
}

func TestRemoveDeletesDraft(t *testing.T) {
	cubeDir := t.TempDir()
	d, err := Create(cubeDir, types.DraftMetadata{Date: "2026-01-01"})
	require.NoError(t, err)
	writeDeck(t, filepath.Join(d.Dir, "1.json"), 1)

	require.NoError(t, d.Remove())
	_, err = Find(cubeDir, d.ID)
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = os.Stat(d.Dir)
	assert.True(t, os.IsNotExist(err))
}

func TestRemoveRefusesUnnumberedDraft(t *testing.T) {
	dir := t.TempDir()
	assert.Error(t, Draft{Dir: dir}.Remove())
	_, err := os.Stat(dir)
	assert.NoError(t, err, "nothing removed")
}
