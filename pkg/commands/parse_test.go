package commands

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestWriteDeckKeepsExistingIDAndNotes(t *testing.T) {
	t.Chdir(t.TempDir())
	path := filepath.Join("data", "polyverse", "d1", "casey.json")
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	existing := types.NewDeck()
	existing.ID = 7
	existing.Player = "casey"
	existing.Notes = "keep me"
	require.NoError(t, existing.Save(path))

	d := types.NewDeck()
	d.Player = "casey"
	require.NoError(t, writeDeck("polyverse", d, "d1"))

	got, err := types.LoadDeck(path)
	require.NoError(t, err)
	require.Equal(t, 7, got.ID)
	require.Equal(t, "keep me", got.Notes)
}

func TestWriteDeckNewDeckGetsNextID(t *testing.T) {
	t.Chdir(t.TempDir())
	for _, player := range []string{"alice", "bob"} {
		d := types.NewDeck()
		d.Player = player
		require.NoError(t, writeDeck("polyverse", d, "d1"))
	}
	d := types.NewDeck()
	d.Player = "carol"
	require.NoError(t, writeDeck("polyverse", d, "d1"))

	got, err := types.LoadDeck(filepath.Join("data", "polyverse", "d1", "carol.json"))
	require.NoError(t, err)
	require.Equal(t, 3, got.ID)
}
