package commands

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// newDraft creates draft 1 of cube "polyverse" under a fresh working directory.
func newDraft(t *testing.T) drafts.Draft {
	t.Helper()
	t.Chdir(t.TempDir())
	draft, err := drafts.Create(filepath.Join("data", "polyverse"), types.DraftMetadata{Date: "2026-01-02"})
	require.NoError(t, err)
	return draft
}

func TestWriteDeckKeepsExistingIDAndNotes(t *testing.T) {
	draft := newDraft(t)
	existing := types.NewDeck()
	existing.ID = 7
	existing.Player = "casey"
	existing.Notes = "keep me"
	path := filepath.Join(draft.Dir, "casey.json")
	require.NoError(t, existing.Save(path))

	d := types.NewDeck()
	d.Player = "Casey"
	require.NoError(t, writeDeck(d, draft))

	got, err := types.LoadDeck(path)
	require.NoError(t, err)
	require.Equal(t, 7, got.ID)
	require.Equal(t, "keep me", got.Notes)
	require.Equal(t, 1, got.Metadata.DraftID)
}

func TestWriteDeckNewDeckGetsNextIDFile(t *testing.T) {
	draft := newDraft(t)
	for _, player := range []string{"alice", "bob", "carol"} {
		d := types.NewDeck()
		d.Player = player
		require.NoError(t, writeDeck(d, draft))
	}

	got, err := types.LoadDeck(drafts.DeckPath(draft.Dir, 3))
	require.NoError(t, err)
	require.Equal(t, 3, got.ID)
	require.Equal(t, "carol", got.Player)
	require.Equal(t, drafts.DeckPath(draft.Dir, 3), got.Metadata.Path)
}
