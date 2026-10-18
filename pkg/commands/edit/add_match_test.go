package edit

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestAddMatchBySeatAndName(t *testing.T) {
	t.Chdir(t.TempDir())
	_, err := players.Add("data", "Joan Jett")
	require.NoError(t, err)
	draft, err := drafts.Create(filepath.Join("data", "polyverse"), types.DraftMetadata{Date: "2026-01-02"})
	require.NoError(t, err)
	playerIDByDeck := map[int]int{
		1: 1,
		2: 0,
	}
	for id, playerID := range playerIDByDeck {
		d := types.NewDeck()
		d.ID, d.PlayerID = id, playerID
		require.NoError(t, draft.SaveDeck(d))
	}

	seat, err := draft.Deck(2)
	require.NoError(t, err)
	seat.Seat = 5
	require.NoError(t, draft.SaveDeck(seat))
	require.Error(t, addMatch(draft, "joan jett", "p2", 2, 1, 0), "p2 names seat 2, which no deck holds")

	require.NoError(t, addMatch(draft, "joan jett", "p5", 2, 1, 0))

	joan, err := draft.Deck(1)
	require.NoError(t, err)
	require.Equal(t, []types.Match{{OpponentID: 2, Wins: 2, Losses: 1, Games: []types.Game{{Won: true}, {Won: true}, {}}}}, joan.Matches)
	seat, err = draft.Deck(2)
	require.NoError(t, err)
	require.Equal(t, []types.Match{{OpponentID: 1, Wins: 1, Losses: 2, Games: []types.Game{{}, {}, {Won: true}}}}, seat.Matches)

	require.ErrorContains(t, addMatch(draft, "joan jett", "p5", 2, 0, 0), "already")
	require.ErrorContains(t, addMatch(draft, "Stevie Nicks", "p5", 2, 0, 0), "players add")
	require.ErrorContains(t, addMatch(draft, "p1", "p5", 2, 0, 0), "not an anonymous seat")
}
