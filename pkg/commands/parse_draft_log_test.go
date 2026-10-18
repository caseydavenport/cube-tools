package commands

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestParseDraftLogResolvesNicknames(t *testing.T) {
	t.Chdir(t.TempDir())
	for _, name := range []string{"Casey", "Dom"} {
		_, err := players.Add("data", name)
		require.NoError(t, err)
	}
	log := &types.DraftLog{Users: map[string]types.User{
		"u1": {UserName: "maserstorm"},
	}}

	decks, err := decksFromDraftLog(log, "2026-01-02")
	require.NoError(t, err)
	require.Len(t, decks, 1)
	require.Equal(t, 2, decks[0].PlayerID)

	log.Users["u2"] = types.User{UserName: "AnythingForDogs"}
	_, err = decksFromDraftLog(log, "2026-01-02")
	require.ErrorContains(t, err, "players add")
}

func TestParseDraftLogRejectsTwoUsersForOnePlayer(t *testing.T) {
	t.Chdir(t.TempDir())
	_, err := players.Add("data", "Dom")
	require.NoError(t, err)
	log := &types.DraftLog{Users: map[string]types.User{
		"u1": {UserName: "maserstorm"},
		"u2": {UserName: "Dom"},
	}}

	_, err = decksFromDraftLog(log, "2026-01-02")
	require.ErrorContains(t, err, "both")
}
