package types

import (
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
