package edit

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestAddMatchByDraftID(t *testing.T) {
	t.Chdir(t.TempDir())
	draft, err := drafts.Create(filepath.Join("data", "polyverse"), types.DraftMetadata{Date: "2026-01-02"})
	require.NoError(t, err)
	for i, player := range []string{"alice", "bob"} {
		d := types.NewDeck()
		d.ID = i + 1
		d.Player = player
		require.NoError(t, d.Save(drafts.DeckPath(draft.Dir, d.ID)))
	}

	require.NoError(t, addMatchToPlayer(draft, "Alice", "bob", 2, 1, 0))

	got, err := types.LoadDeck(drafts.DeckPath(draft.Dir, 1))
	require.NoError(t, err)
	require.Len(t, got.Matches, 1)
	require.Equal(t, "bob", got.Matches[0].Opponent)
	require.Equal(t, "alice", got.Matches[0].Winner)
	require.Len(t, got.Matches[0].Games, 3)
	require.Equal(t, 2, got.Matches[0].Wins)
	require.Equal(t, 1, got.Matches[0].Losses)
}
