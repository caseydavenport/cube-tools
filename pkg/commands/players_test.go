package commands

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestPlayersAssign(t *testing.T) {
	draft := newDraft(t)
	seedPlayers(t)
	for id := 1; id <= 2; id++ {
		d := types.NewDeck()
		d.ID = id
		require.NoError(t, d.Save(drafts.DeckPath(draft.Dir, id)))
	}

	require.NoError(t, assignPlayer("polyverse", draft.ID, 1, "joan jett"))
	got, err := types.LoadDeck(drafts.DeckPath(draft.Dir, 1))
	require.NoError(t, err)
	require.Equal(t, 3, got.PlayerID)

	require.ErrorContains(t, assignPlayer("polyverse", draft.ID, 2, "3"), "already has deck 1")
	require.ErrorContains(t, assignPlayer("polyverse", draft.ID, 2, "Stevie Nicks"), "players add")

	require.NoError(t, assignPlayer("polyverse", draft.ID, 1, "anonymous"))
	got, err = types.LoadDeck(drafts.DeckPath(draft.Dir, 1))
	require.NoError(t, err)
	require.Equal(t, 0, got.PlayerID)
}
