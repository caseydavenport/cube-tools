package stats

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

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

// packageIndexFor serves /stats/packages over store and decodes it.
func packageIndexFor(t *testing.T, store *rulesDeckStorage) (string, PackageStatsResponse) {
	t.Helper()
	rr := serveCube(PackageStatsHandler(store, testCubeSource{}), "/api/polyverse/stats/packages", url.Values{})
	require.Equal(t, http.StatusOK, rr.Code)
	var resp PackageStatsResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	return rr.Body.String(), resp
}

func TestPackageIndex_NoDecks(t *testing.T) {
	store := &rulesDeckStorage{config: design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Bombardment", Conditions: []string{`n:"Goblin Bombardment"`}},
			{Name: "Burn", Conditions: []string{`n:"Lightning Bolt"`}},
		},
		Packages: []design.Package{
			{Name: "Damage", Wires: []design.Wire{{Sources: []string{"Bombardment"}, Targets: []string{"Burn"}}}},
			{Name: "Sacrifice", Wires: []design.Wire{{Sources: []string{"Bombardment"}, Targets: []string{"Burn"}}}},
		},
	}}
	_, resp := packageIndexFor(t, store)

	require.Len(t, resp.Packages, 2)
	for _, p := range resp.Packages {
		assert.Equal(t, 0, p.Package)
		assert.Equal(t, 2, p.CardCount)
		assert.Equal(t, "R", p.Color)
	}
	assert.Equal(t, []PackageEdge{{Source: "Damage", Target: "Sacrifice", Groups: []string{"Bombardment", "Burn"}}}, resp.Edges)
	require.NotEmpty(t, resp.MostLinked)
	assert.Equal(t, 2, resp.MostLinked[0].Count)
}

func TestPackageIndex_EmptyListsNotNull(t *testing.T) {
	body, _ := packageIndexFor(t, &rulesDeckStorage{})
	assert.NotContains(t, body, "null")
	for _, field := range []string{"packages", "edges", "mostLinked"} {
		assert.Contains(t, body, `"`+field+`":[`, field)
	}
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
