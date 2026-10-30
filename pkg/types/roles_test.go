package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRoles_FromTags(t *testing.T) {
	removal := Card{OracleTags: []string{"removal", "removal-creature", "single-target-instant-sorcery"}}
	assert.True(t, removal.IsRemoval())
	assert.True(t, removal.IsInteraction())
	assert.False(t, removal.IsCounterspell())
	assert.True(t, removal.HasRole(RoleRemovalCreature))

	draw := Card{OracleTags: []string{"draw"}}
	assert.True(t, draw.IsCardDraw())
	assert.False(t, draw.IsInteraction())
}

func TestRoles_FromOracleKeepsOnlyRoleTags(t *testing.T) {
	loadFixtureTags(t)

	card := FromOracle(OracleCard{OracleID: "oid-bolt", Name: "Lightning Bolt"})
	assert.Equal(t, []string{"removal", "removal-creature"}, card.Roles, "cycle is a tag but not a role")
	assert.True(t, card.IsRemoval())
}

func TestRoles_HandDisruptionIsInteraction(t *testing.T) {
	card := Card{OracleTags: []string{"hand-disruption"}}
	assert.True(t, card.IsHandDisruption())
	assert.True(t, card.IsInteraction())
	assert.False(t, card.IsRemoval())
}

func TestRoles_Graveyard(t *testing.T) {
	assert.True(t, Card{OracleTags: []string{"mill-self"}}.IsGraveyard())
	assert.True(t, Card{OracleTags: []string{"reanimate"}}.IsGraveyard())
	assert.False(t, Card{OracleTags: []string{"hate-graveyard"}}.IsGraveyard(), "graveyard hate isn't a graveyard plan")
}

func TestRoles_DiscardOutletIsNotInteraction(t *testing.T) {
	card := Card{OracleTags: []string{"discard-outlet"}}
	assert.True(t, card.IsDiscardOutlet())
	assert.False(t, card.IsInteraction())
}

func TestRoles_UnknownCardHasNone(t *testing.T) {
	card := HydrateCard("No Such Card")
	assert.Empty(t, card.Roles)
	assert.False(t, card.IsRemoval())
	assert.False(t, card.IsInteraction())
}
