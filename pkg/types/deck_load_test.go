package types

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func writeDeckFile(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "deck.json")
	require.NoError(t, os.WriteFile(path, []byte(contents), 0o644))
	return path
}

func TestLoadDeck_LegacyCountsBecomeOneMatch(t *testing.T) {
	deck, err := LoadDeck(writeDeckFile(t, `{"wins": 2, "losses": 1}`))
	require.NoError(t, err)
	assert.Equal(t, []Match{{Wins: 2, Losses: 1}}, deck.Matches)
}

func TestLoadDeck_LegacyLossesOnly(t *testing.T) {
	deck, err := LoadDeck(writeDeckFile(t, `{"losses": 3}`))
	require.NoError(t, err)
	assert.Equal(t, []Match{{Losses: 3}}, deck.Matches)
}

func TestLoadDeck_LegacyZeroCountsMakeNoMatch(t *testing.T) {
	deck, err := LoadDeck(writeDeckFile(t, `{"wins": 0, "losses": 0}`))
	require.NoError(t, err)
	assert.Empty(t, deck.Matches, "a 0-0 stub would count as a draw")
	assert.Equal(t, 0, deck.MatchDraws())
}

func TestLoadDeck_NoLegacyCountsMakeNoMatch(t *testing.T) {
	deck, err := LoadDeck(writeDeckFile(t, `{"name": "Ozzy's Deck"}`))
	require.NoError(t, err)
	assert.Empty(t, deck.Matches)
	assert.Equal(t, "Ozzy's Deck", deck.Name)
}

func TestLoadDeck_EmptyMatchesStayEmptyNotNil(t *testing.T) {
	deck, err := LoadDeck(writeDeckFile(t, `{"matches": []}`))
	require.NoError(t, err)
	require.NotNil(t, deck.Matches, "the API sends nil matches as null instead of []")
	assert.Empty(t, deck.Matches)
}

func TestLoadDeck_MatchesWinOverLegacyCounts(t *testing.T) {
	deck, err := LoadDeck(writeDeckFile(t, `{"wins": 5, "losses": 5, "matches": [{"opponent_id": 2, "wins": 2}]}`))
	require.NoError(t, err)
	assert.Equal(t, []Match{{OpponentID: 2, Wins: 2}}, deck.Matches)
}

func TestLoadDeck_BadJSON(t *testing.T) {
	_, err := LoadDeck(writeDeckFile(t, `{"wins": `))
	assert.Error(t, err)
}

func TestLoadDeck_MissingFile(t *testing.T) {
	_, err := LoadDeck(filepath.Join(t.TempDir(), "nope.json"))
	assert.ErrorIs(t, err, os.ErrNotExist)
}

func TestMetadataGetSourceFiles(t *testing.T) {
	meta := Metadata{CombinedFile: "all.txt", MainboardFile: "main.txt", SideboardFile: "side.txt", PoolFile: "pool.txt"}
	assert.Equal(t, []string{"all.txt", "main.txt", "side.txt", "pool.txt"}, meta.GetSourceFiles())

	assert.Equal(t, []string{"main.txt"}, (&Metadata{MainboardFile: "main.txt"}).GetSourceFiles())
	assert.Empty(t, (&Metadata{}).GetSourceFiles())
}

func TestMacro_ArchetypeFieldBeatsLabels(t *testing.T) {
	deck := NewDeck()
	deck.MacroArchetype = "Control"
	deck.Labels = []string{"aggro"}
	assert.Equal(t, "control", deck.Macro())
}
