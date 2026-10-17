package types

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeckSaveRoundTripsIdentityAndNotes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "deck.json")
	d := NewDeck()
	d.ID = 3
	d.Player = "Alice"
	d.Notes = "great deck"
	d.Matches = []Match{{Opponent: "Bob", OpponentID: 2, Round: 1, Wins: 2}}
	require.NoError(t, d.Save(path))

	got, err := LoadDeck(path)
	require.NoError(t, err)
	assert.Equal(t, 3, got.ID)
	assert.Equal(t, "great deck", got.Notes)
	assert.Equal(t, 2, got.Matches[0].OpponentID)
}

func TestMarshalCompactNameFree(t *testing.T) {
	path := filepath.Join(t.TempDir(), "1.json")
	d := NewDeck()
	d.ID = 1
	d.PlayerID = 1
	d.Player = "Freddie"
	d.Matches = []Match{{
		Opponent: "Ozzy", OpponentID: 2, OpponentPlayerID: 4, Round: 1, Wins: 1, Losses: 1, Winner: "",
		Games: []Game{{Opponent: "Ozzy", Winner: "Freddie", Won: true}, {Opponent: "Ozzy", Winner: "Ozzy"}},
	}}
	require.NoError(t, d.Save(path))

	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	var generic map[string]any
	require.NoError(t, json.Unmarshal(raw, &generic))
	assert.NotContains(t, generic, "player")
	assert.EqualValues(t, 1, generic["player_id"])
	for _, banned := range []string{`"opponent"`, `"winner"`, `"opponent_player_id"`} {
		assert.NotContains(t, string(raw), banned)
	}
	m := generic["matches"].([]any)[0].(map[string]any)
	assert.Equal(t, []any{map[string]any{"won": true}, map[string]any{}}, m["games"])

	got, err := LoadDeck(path)
	require.NoError(t, err)
	assert.Equal(t, 1, got.PlayerID)
	assert.Equal(t, "", got.Player)
	assert.Equal(t, 2, got.Matches[0].OpponentID)
	assert.Equal(t, 1, got.Matches[0].Wins)
	assert.Equal(t, 1, got.Matches[0].Losses)
	assert.Equal(t, []Game{{Won: true}, {}}, got.Matches[0].Games)
}

func TestMarshalCompactIgnoresNames(t *testing.T) {
	path := filepath.Join(t.TempDir(), "1.json")
	d := NewDeck()
	d.ID = 1
	d.Matches = []Match{{OpponentID: 2, Wins: 1, Losses: 1, Games: []Game{{Won: true}, {Tie: true}}}}
	require.NoError(t, d.Save(path))

	got, err := LoadDeck(path)
	require.NoError(t, err)
	assert.Equal(t, []Game{{Won: true}, {Tie: true}}, got.Matches[0].Games)
}
