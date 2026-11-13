package commands

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseManapoolCardsSkipsOwnedAndMaybeboard(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cards.csv")
	csv := "name,Set,Collector Number,status,maybeboard\n" +
		"Shock,m19,156,false,false\n" +
		"Counterspell,mh2,267,true,false\n" +
		"Brainstorm,ice,61,false,true\n"
	require.NoError(t, os.WriteFile(path, []byte(csv), 0o644))

	cards, err := parseManapoolCards(path)
	require.NoError(t, err)
	require.Equal(t, []manapoolCard{{name: "Shock", set: "m19", number: "156"}}, cards)
}

func TestParseManapoolCardsNeedsEveryColumn(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cards.csv")
	require.NoError(t, os.WriteFile(path, []byte("name,Set\nShock,m19\n"), 0o644))

	_, err := parseManapoolCards(path)
	require.ErrorContains(t, err, "needs name")
}

func TestParseManapoolCardsMissingFile(t *testing.T) {
	_, err := parseManapoolCards(filepath.Join(t.TempDir(), "nope.csv"))
	require.Error(t, err)
}
