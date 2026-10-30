package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// interactionCube holds a small and a large creature, a burn spell that only
// kills the small one, a destroy spell that kills both, and a land.
func interactionCube() *types.Cube {
	return &types.Cube{Cards: []types.Card{
		{Name: "Bear", Types: []string{"Creature"}, CMC: 2, Power: "2", Toughness: "2"},
		{Name: "Giant", Types: []string{"Creature"}, CMC: 7, Power: "7", Toughness: "7"},
		removalCard("Shock", "Shock deals 2 damage to any target."),
		removalCard("Murder", "Destroy target creature."),
		{Name: "Plains", Types: []string{"Basic", "Land"}},
	}}
}

func TestCardInteraction_CreatureAnswers(t *testing.T) {
	cube := interactionCube()

	bear := cardInteraction(cube.Cards[0], cube)
	assert.Equal(t, []string{"Murder", "Shock"}, bear.AnsweredBy)
	assert.Empty(t, bear.Removal)
	assert.Equal(t, 2, bear.Creatures)

	giant := cardInteraction(cube.Cards[1], cube)
	assert.Equal(t, []string{"Murder"}, giant.AnsweredBy)
}

func TestCardInteraction_RemovalRows(t *testing.T) {
	cube := interactionCube()

	got := cardInteraction(cube.Cards[2], cube)
	require.Len(t, got.Removal, 1)
	assert.Equal(t, 1, got.Removal[0].Targets)
	assert.Equal(t, 50.0, got.Removal[0].PctCube)
	assert.Empty(t, got.AnsweredBy)
}

func TestCardInteraction_OutsideCubeRemoval(t *testing.T) {
	cube := interactionCube()

	got := cardInteraction(removalCard("Lightning Bolt", "Lightning Bolt deals 3 damage to any target."), cube)
	require.Len(t, got.Removal, 1)
	assert.Equal(t, 1, got.Removal[0].Targets)

	// An outside creature is checked against the cube's removal.
	troll := types.Card{Name: "Troll", Types: []string{"Creature"}, CMC: 4, Power: "4", Toughness: "4"}
	assert.Equal(t, []string{"Murder"}, cardInteraction(troll, cube).AnsweredBy)
}

func TestCardInteraction_NeitherIsEmpty(t *testing.T) {
	cube := interactionCube()

	got := cardInteraction(cube.Cards[4], cube)
	assert.NotNil(t, got.AnsweredBy)
	assert.NotNil(t, got.Removal)
	assert.Empty(t, got.AnsweredBy)
	assert.Empty(t, got.Removal)
}
