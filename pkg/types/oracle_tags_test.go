package types

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// loadFixtureTags loads the test tag file and restores the empty tag set when
// the test ends, so other tests see cards without tags.
func loadFixtureTags(t *testing.T) {
	t.Helper()
	require.NoError(t, LoadOracleTags("testdata/oracle-tags.jsonl"))
	t.Cleanup(func() { oracleTags = newTagIndex() })
}

func TestLoadOracleTags_AncestorsIncluded(t *testing.T) {
	loadFixtureTags(t)

	assert.Equal(t, []string{"cycle", "removal", "removal-creature"}, OracleTagsFor("oid-bolt"))
	assert.Equal(t, []string{"mill-self"}, OracleTagsFor("oid-dfc"))
	assert.Empty(t, OracleTagsFor("oid-unknown"))
}

func TestLoadOracleTags_CountsIncludeDescendants(t *testing.T) {
	loadFixtureTags(t)

	removal, ok := LookupOracleTag("removal")
	require.True(t, ok)
	assert.Equal(t, 1, removal.Cards, "removal has no direct taggings, so its card comes from removal-creature")
	assert.Empty(t, removal.Ancestors)

	creature, ok := LookupOracleTag("removal-creature")
	require.True(t, ok)
	assert.Equal(t, []string{"removal"}, creature.Ancestors)
	assert.Equal(t, 4, OracleTagCount())
}

func TestLookupOracleTag_Spellings(t *testing.T) {
	loadFixtureTags(t)

	for _, name := range []string{"creature-removal", "Removal-Creature", "creature removal"} {
		tag, ok := LookupOracleTag(name)
		require.True(t, ok, name)
		assert.Equal(t, "removal-creature", tag.Slug, name)
	}
	for _, name := range []string{"self mill", "self-mill", "Mill Self"} {
		tag, ok := LookupOracleTag(name)
		require.True(t, ok, name)
		assert.Equal(t, "mill-self", tag.Slug, name)
	}

	_, ok := LookupOracleTag("nope")
	assert.False(t, ok)
}

func TestLoadOracleTags_MissingFileLeavesCardsUntagged(t *testing.T) {
	loadFixtureTags(t)

	err := LoadOracleTags("testdata/no-such-file.jsonl")
	require.ErrorIs(t, err, os.ErrNotExist)

	// A failed load keeps whatever was loaded before; a fresh index has none.
	oracleTags = newTagIndex()
	card := FromOracle(OracleCard{OracleID: "oid-bolt", Name: "Lightning Bolt"})
	assert.Nil(t, card.OracleTags)
	assert.Equal(t, 0, OracleTagCount())
}

func TestFromOracle_FrontFaceGetsTags(t *testing.T) {
	loadFixtureTags(t)

	dfc := OracleCard{OracleID: "oid-dfc", Name: "Front // Back", TypeLine: "Creature // Land"}
	assert.Equal(t, []string{"mill-self"}, FromOracle(dfc).OracleTags)

	// The loader indexes a "//" card under its front face too, and both
	// entries share an oracle id, so the front-face lookup gets the same tags.
	prev := oracleCards
	t.Cleanup(func() { oracleCards = prev })
	oracleCards = map[string]OracleCard{
		"Front // Back": dfc,
		"Front":         dfc,
	}
	assert.Equal(t, []string{"mill-self"}, HydrateCard("Front").OracleTags)
}
