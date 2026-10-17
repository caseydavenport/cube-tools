package drafts

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/players"
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

func TestDeckFilesSkipsNonDecks(t *testing.T) {
	dir := t.TempDir()
	writeDeck(t, filepath.Join(dir, "b.json"), 2)
	writeDeck(t, filepath.Join(dir, "a.json"), 1)
	for _, name := range []string{"metadata.json", "cube-snapshot.json", "draft-log.json", ".ocr-session.json"} {
		writeFile(t, filepath.Join(dir, name), "{}")
	}
	writeFile(t, filepath.Join(dir, "casey.report.md"), "notes")

	got, err := DeckFiles(dir)
	require.NoError(t, err)
	assert.Equal(t, []string{filepath.Join(dir, "a.json"), filepath.Join(dir, "b.json")}, got)
}

func TestNextDeckID(t *testing.T) {
	dir := t.TempDir()
	writeDeck(t, filepath.Join(dir, "a.json"), 1)
	writeDeck(t, filepath.Join(dir, "b.json"), 4)
	writeFile(t, filepath.Join(dir, "metadata.json"), `{"id": 99}`)

	got, err := NextDeckID(dir)
	require.NoError(t, err)
	assert.Equal(t, 5, got)
}

func TestNextDeckIDEmptyDir(t *testing.T) {
	got, err := NextDeckID(t.TempDir())
	require.NoError(t, err)
	assert.Equal(t, 1, got)

	got, err = NextDeckID(filepath.Join(t.TempDir(), "missing"))
	require.NoError(t, err)
	assert.Equal(t, 1, got)
}

func TestNextDeckIDBadDeckFile(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "broken.json"), "{not json")

	_, err := NextDeckID(dir)
	assert.ErrorContains(t, err, "broken.json")
}

func TestCreateAssignsNextIDAndDir(t *testing.T) {
	cubeDir := t.TempDir()

	first, err := Create(cubeDir, types.DraftMetadata{Date: "2026-01-02", EventName: "Local", EventCode: "local"})
	require.NoError(t, err)
	assert.Equal(t, 1, first.ID)
	assert.Equal(t, filepath.Join(cubeDir, "0001_2026-01-02"), first.Dir)

	meta, err := types.LoadDraftMetadata(first.Dir)
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
	require.NoError(t, meta.Save(dir))
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

func TestLoadDeckByID(t *testing.T) {
	dir := t.TempDir()
	writeDeck(t, filepath.Join(dir, "5.json"), 5)
	writeDeck(t, filepath.Join(dir, "casey.json"), 2)

	d, path, err := LoadDeck(dir, 2)
	require.NoError(t, err)
	assert.Equal(t, 2, d.ID)
	assert.Equal(t, filepath.Join(dir, "casey.json"), path)

	_, _, err = LoadDeck(dir, 9)
	assert.ErrorIs(t, err, ErrNotFound)

	assert.Equal(t, filepath.Join(dir, "5.json"), DeckPath(dir, 5))
	assert.Equal(t, "0042_2026-10-13", DirName(42, "2026-10-13"))
}

func TestFindDeckByPlayerID(t *testing.T) {
	dir := t.TempDir()
	d := types.NewDeck()
	d.ID = 4
	d.PlayerID = 7
	require.NoError(t, d.Save(filepath.Join(dir, "4.json")))

	got, path, err := FindDeckByPlayerID(dir, 7)
	require.NoError(t, err)
	assert.Equal(t, 4, got.ID)
	assert.Equal(t, filepath.Join(dir, "4.json"), path)

	_, _, err = FindDeckByPlayerID(dir, 8)
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestLoadDecksResolves(t *testing.T) {
	dir := t.TempDir()
	a := types.NewDeck()
	a.ID = 1
	a.PlayerID = 1
	a.Matches = []types.Match{{OpponentID: 2, Wins: 2}}
	require.NoError(t, a.Save(filepath.Join(dir, "1.json")))
	b := types.NewDeck()
	b.ID = 2
	require.NoError(t, b.Save(filepath.Join(dir, "2.json")))

	pl := &players.List{Players: []players.Player{{ID: 1, Name: "Joan Jett"}}}
	got, err := LoadDecks(dir, pl)
	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, "Joan Jett", got[0].Player)
	assert.Equal(t, "p2", got[0].Matches[0].Opponent)
	assert.Equal(t, "p2", got[1].Player)
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
