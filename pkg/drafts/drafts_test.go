package drafts

import (
	"os"
	"path/filepath"
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
