package stats

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// relationsConfig wires sacrifice outlets to sacrifice payoffs, and keeps a
// broad small-creatures group that wires to nothing.
func relationsConfig() design.DesignMapConfig {
	return design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Sacs creatures", Conditions: []string{`o:"sacrifice a creature"`}},
			{Name: "Sacrifice matters", Conditions: []string{"o:sacrifices"}},
			{Name: "Pow<2", Conditions: []string{"pow<2"}},
		},
		Packages: []design.Package{
			{Name: "Sacrifice", Wires: []design.Wire{{Sources: []string{"Sacs creatures"}, Targets: []string{"Sacrifice matters"}}}},
		},
	}
}

// relationsCube holds two sacrifice outlets, two payoffs and five small
// creatures that share only their size.
func relationsCube() *types.Cube {
	cube := &types.Cube{Cards: []types.Card{
		{
			Name:       "Goblin Bombardment",
			Types:      []string{"Enchantment"},
			Colors:     []string{"R"},
			OracleText: "Sacrifice a creature: Goblin Bombardment deals 1 damage to any target.",
			OracleTags: []string{"sacrifice-outlet"},
		},
		{
			Name:       "Carrion Feeder",
			Types:      []string{"Creature"},
			Colors:     []string{"B"},
			Power:      "1",
			OracleText: "Sacrifice a creature: Put a +1/+1 counter on Carrion Feeder.",
			OracleTags: []string{"sacrifice-outlet"},
		},
		{Name: "Mayhem Devil", Types: []string{"Creature"}, Colors: []string{"B", "R"}, Power: "3", OracleText: "Whenever a player sacrifices a permanent, Mayhem Devil deals 1 damage to any target."},
		{Name: "Cauldron Familiar", Types: []string{"Creature"}, Colors: []string{"B"}, Power: "1", OracleText: "Whenever a player sacrifices a Food, you gain 1 life."},
	}}
	for i := 0; i < 5; i++ {
		cube.Cards = append(cube.Cards, types.Card{Name: fmt.Sprintf("Small Creature %d", i), Types: []string{"Creature"}, Power: "1", OracleText: "Vigilance"})
	}
	return cube
}

func TestCardRelations_GroupsOf(t *testing.T) {
	r := newCardRelations(testRules(t, relationsCube(), relationsConfig()), relationsConfig(), nil)
	assert.Equal(t, []string{"Sacs creatures"}, r.groupsOf("Goblin Bombardment"))
	assert.Equal(t, []string{"Pow<2", "Sacs creatures"}, r.groupsOf("Carrion Feeder"))
	assert.Empty(t, r.groupsOf("Not A Card"))
}

func TestCardRelations_PartnersByPackage(t *testing.T) {
	relations := newCardRelations(testRules(t, relationsCube(), relationsConfig()), relationsConfig(), nil)
	numDecksByName := map[string]int{
		"Mayhem Devil":      8,
		"Cauldron Familiar": 2,
	}
	got := relations.partners("Goblin Bombardment", numDecksByName)
	want := []PackagePartners{{Package: "Sacrifice", Cards: []PartnerCard{
		{Name: "Mayhem Devil", Colors: []string{"B", "R"}, Decks: 8},
		{Name: "Cauldron Familiar", Colors: []string{"B"}, Decks: 2},
	}}}
	assert.Equal(t, want, got)

	// A card on the target side partners the sources, not its fellow targets.
	devil := relations.partners("Mayhem Devil", nil)
	require.Len(t, devil, 1)
	assert.Equal(t, []string{"Carrion Feeder", "Goblin Bombardment"}, partnerNames(devil[0]))

	// A card in no wired group has no partners.
	assert.Empty(t, relations.partners("Small Creature 0", nil))
}

func TestCardRelations_PartnersSkipCutCards(t *testing.T) {
	seedOracle(t, `[
		{"name":"Blood Artist","type_line":"Creature","oracle_text":"Whenever a player sacrifices a creature, target player loses 1 life.","colors":["B"],"cmc":2,"power":"0"}
	]`)
	r := newCardRelations(testRules(t, relationsCube(), relationsConfig(), "Blood Artist"), relationsConfig(), nil)

	assert.Equal(t, []string{"Pow<2", "Sacrifice matters"}, r.groupsOf("Blood Artist"))
	got := r.partners("Goblin Bombardment", nil)
	require.Len(t, got, 1)
	assert.NotContains(t, partnerNames(got[0]), "Blood Artist")
}

func TestCardRelations_LinksBetween(t *testing.T) {
	r := newCardRelations(testRules(t, relationsCube(), relationsConfig()), relationsConfig(), nil)

	want := []CardBridge{{Package: "Sacrifice", Group: "Sacs creatures", OtherGroup: "Sacrifice matters"}}
	assert.Equal(t, want, r.linksBetween("Goblin Bombardment", "Mayhem Devil"))

	swapped := []CardBridge{{Package: "Sacrifice", Group: "Sacrifice matters", OtherGroup: "Sacs creatures"}}
	assert.Equal(t, swapped, r.linksBetween("Mayhem Devil", "Goblin Bombardment"))

	unrelated := r.linksBetween("Goblin Bombardment", "Small Creature 0")
	assert.NotNil(t, unrelated)
	assert.Empty(t, unrelated)
}

func TestCardRelations_CardRefWire(t *testing.T) {
	config := relationsConfig()
	config.Packages = append(config.Packages, design.Package{
		Name:  "Bombardment",
		Wires: []design.Wire{{Sources: []string{"card:Goblin Bombardment"}, Targets: []string{"Pow<2"}}},
	})
	r := newCardRelations(testRules(t, relationsCube(), config), config, nil)

	got := r.linksBetween("Goblin Bombardment", "Small Creature 0")
	assert.Equal(t, []CardBridge{{Package: "Bombardment", Group: "card:Goblin Bombardment", OtherGroup: "Pow<2"}}, got)
	assert.NotContains(t, r.groupsOf("Goblin Bombardment"), "card:Goblin Bombardment")
}

func TestCardRelations_ExtraCardJoinsGroups(t *testing.T) {
	extra := types.Card{Name: "Viscera Seer", Types: []string{"Creature"}, Colors: []string{"B"}, Power: "1", OracleText: "Sacrifice a creature: Scry 1."}
	r := newCardRelations(testRules(t, relationsCube(), relationsConfig()), relationsConfig(), []types.Card{extra})

	assert.Equal(t, []string{"Pow<2", "Sacs creatures"}, r.groupsOf("Viscera Seer"))
	got := r.partners("Viscera Seer", nil)
	require.Len(t, got, 1)
	assert.Equal(t, []string{"Cauldron Familiar", "Mayhem Devil"}, partnerNames(got[0]))

	// Without the extra card, nothing knows it.
	plain := newCardRelations(testRules(t, relationsCube(), relationsConfig()), relationsConfig(), nil)
	assert.Empty(t, plain.groupsOf("Viscera Seer"))
}

func TestCardRelations_SameRolePrefersRareFeatures(t *testing.T) {
	r := newCardRelations(testRules(t, relationsCube(), relationsConfig()), relationsConfig(), nil)
	cube := relationsCube()

	got := r.sameRole(cube.Cards[0], 6)
	require.NotEmpty(t, got)
	assert.Equal(t, "Carrion Feeder", got[0])
	assert.NotContains(t, got, "Goblin Bombardment")

	// A small creature's best match shares its rarer outlet group, not just size.
	feeder := r.sameRole(cube.Cards[1], 1)
	assert.Equal(t, []string{"Goblin Bombardment"}, feeder)
}

// partnerNames lists a package's partner names, in order.
func partnerNames(p PackagePartners) []string {
	var out []string
	for _, c := range p.Cards {
		out = append(out, c.Name)
	}
	return out
}
