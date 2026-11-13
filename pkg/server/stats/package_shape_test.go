package stats

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// shapeCube is a cube holding the named cards.
func shapeCube(cards ...types.Card) *types.Cube {
	return &types.Cube{Cards: cards}
}

// oneSide is a package whose one wire has every named card on its source
// side and nothing on its target side.
func oneSide(name string, cards ...string) design.PackageCards {
	return design.PackageCards{Name: name, Wires: []design.WireCards{{Sources: cardSet(cards...), Targets: cardSet()}}}
}

func TestPackageColor_MainColor(t *testing.T) {
	cube := shapeCube(
		tendencySpell("Shock", "R"),
		tendencySpell("Lightning Bolt", "R"),
		tendencySpell("Fireblast", "R"),
		tendencySpell("Terminate", "B", "R"),
		tendencySpell("Counterspell", "U"),
		types.Card{Name: "Bloodstained Mire", Types: []string{"Land"}},
	)
	p := oneSide("Burn", "Shock", "Lightning Bolt", "Fireblast", "Terminate", "Counterspell", "Bloodstained Mire")
	assert.Equal(t, "R", packageColor(p, cube))
}

func TestPackageColor_GrayWhenSpread(t *testing.T) {
	cube := shapeCube(
		tendencySpell("Swords to Plowshares", "W"),
		tendencySpell("Counterspell", "U"),
		tendencySpell("Doom Blade", "B"),
		tendencySpell("Shock", "R"),
		tendencySpell("Giant Growth", "G"),
	)
	p := oneSide("Spells", "Swords to Plowshares", "Counterspell", "Doom Blade", "Shock", "Giant Growth")
	assert.Equal(t, "", packageColor(p, cube))
}

func TestPackageColor_GrayWhenColorlessLeads(t *testing.T) {
	cube := shapeCube(tendencySpell("Sol Ring"), tendencySpell("Mind Stone"), tendencySpell("Wayfarer's Bauble"), tendencySpell("Shock", "R"))
	p := oneSide("Artifacts", "Sol Ring", "Mind Stone", "Wayfarer's Bauble", "Shock")
	assert.Equal(t, "", packageColor(p, cube))
}

func TestPackageColor_GrayWhenCloseRace(t *testing.T) {
	var cards []types.Card
	var names []string
	for i := range 10 {
		cards = append(cards, tendencySpell(fmt.Sprintf("Green %d", i), "G"))
		names = append(names, fmt.Sprintf("Green %d", i))
	}
	for i := range 9 {
		cards = append(cards, tendencySpell(fmt.Sprintf("White %d", i), "W"))
		names = append(names, fmt.Sprintf("White %d", i))
	}
	assert.Equal(t, "", packageColor(oneSide("Tokens", names...), shapeCube(cards...)))
}

func TestPackageCardCount_CubeCardsOnly(t *testing.T) {
	cube := shapeCube(tendencySpell("Shock", "R"), tendencySpell("Lightning Bolt", "R"))
	p := design.PackageCards{Name: "Burn", Wires: []design.WireCards{
		{Sources: cardSet("Shock", "Chain Lightning"), Targets: cardSet("Lightning Bolt", "Shock")},
	}}
	assert.Equal(t, 2, packageCardCount(p, cube))
}

func TestPackageEdges_SharedGroups(t *testing.T) {
	config := design.DesignMapConfig{Packages: []design.Package{
		{Name: "Reanimate", Wires: []design.Wire{{Sources: []string{"Graveyard"}, Targets: []string{"Reanimate targets"}}}},
		{Name: "Delirium", Wires: []design.Wire{{Sources: []string{"Graveyard"}, Targets: []string{"Delirium payoffs"}}}},
		{Name: "Tokens", Wires: []design.Wire{{Sources: []string{"Tokens"}, Targets: []string{"Sacrifice"}}}},
	}}
	assert.Equal(t, []PackageEdge{{Source: "Delirium", Target: "Reanimate", Groups: []string{"Graveyard"}}}, packageEdges(config))
}

func TestPackageEdges_IgnoresCardRefs(t *testing.T) {
	config := design.DesignMapConfig{Packages: []design.Package{
		{Name: "Sacrifice", Wires: []design.Wire{{Sources: []string{"card:Goblin Bombardment"}, Targets: []string{"Tokens"}}}},
		{Name: "Burn", Wires: []design.Wire{{Sources: []string{"card:Goblin Bombardment"}, Targets: []string{"Burn spells"}}}},
	}}
	assert.Empty(t, packageEdges(config))
}

func TestMostLinked_RanksByPackages(t *testing.T) {
	cube := shapeCube(
		tendencySpell("Goblin Bombardment", "R"),
		tendencySpell("Mayhem Devil", "B", "R"),
		tendencySpell("Shock", "R"),
		tendencySpell("Abrade", "R"),
		types.Card{Name: "Mountain", Types: []string{"Basic", "Land"}},
	)
	pkgs := []design.PackageCards{
		oneSide("Sacrifice", "Goblin Bombardment", "Mayhem Devil", "Mountain"),
		oneSide("Tokens", "Goblin Bombardment", "Mayhem Devil", "Abrade"),
		oneSide("Burn", "Goblin Bombardment", "Shock", "Abrade", "Chain Lightning"),
	}

	got := mostLinked(pkgs, cube, 3)
	assert.Equal(t, []NamedCount{
		{Name: "Goblin Bombardment", Count: 3},
		{Name: "Abrade", Count: 2},
		{Name: "Mayhem Devil", Count: 2},
	}, got)
}
