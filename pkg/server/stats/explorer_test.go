package stats

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

const (
	outletText  = "Sacrifice a creature: Scry 1."
	makerText   = "Create a 1/1 white Soldier creature token."
	fetcherText = "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle."
)

// explorerCube is the explorer tests' cube: two artifact outlets, three token
// makers, twelve vanilla creatures, one basic-land fetcher and one payoff a
// wire names directly.
func explorerCube() *types.Cube {
	cards := []types.Card{
		{Name: "Outlet A", Types: []string{"Artifact"}, OracleText: outletText},
		{Name: "Outlet B", Types: []string{"Artifact"}, OracleText: outletText},
		{Name: "Maker A", Types: []string{"Sorcery"}, OracleText: makerText},
		{Name: "Maker B", Types: []string{"Sorcery"}, OracleText: makerText},
		{Name: "Maker C", Types: []string{"Sorcery"}, OracleText: makerText},
		{Name: "Fetcher", Types: []string{"Sorcery"}, OracleText: fetcherText},
		{Name: "Lone Payoff", Types: []string{"Enchantment"}, OracleText: "Whenever a creature dies, draw a card."},
	}
	for i := 1; i <= 12; i++ {
		cards = append(cards, types.Card{Name: fmt.Sprintf("Bear %d", i), Types: []string{"Creature"}, Power: "2", Toughness: "2"})
	}
	return &types.Cube{Cards: cards}
}

// explorerConfig is the explorer tests' rules: makers enable outlets, creatures
// enable makers, and basic lands enable the fetcher.
func explorerConfig() design.DesignMapConfig {
	return design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Outlets", Conditions: []string{`o:"sacrifice a creature"`}},
			{Name: "Makers", Conditions: []string{`o:"create a"`}},
			{Name: "Creatures", Conditions: []string{"t:creature"}},
			{Name: "Fetchers", Conditions: []string{`o:"a basic land"`}},
			{Name: "Basic lands", Conditions: []string{"t:land t:basic"}},
		},
		Packages: []design.Package{
			{Name: "Sacrifice", Wires: []design.Wire{{Kind: design.WireEnables, Sources: []string{"Makers"}, Targets: []string{"Outlets"}}}},
			{Name: "Swarm", Wires: []design.Wire{{Kind: design.WireEnables, Sources: []string{"Creatures"}, Targets: []string{"Makers"}}}},
			{Name: "Ramp", Wires: []design.Wire{{Kind: design.WireEnables, Sources: []string{"Basic lands"}, Targets: []string{"Fetchers"}}}},
		},
	}
}

// explore scores cards against config over the explorer cube at a thin side
// of 10, keyed by card name.
func explore(t *testing.T, config design.DesignMapConfig, thin int, cards ...types.Card) map[string]ExplorerCard {
	t.Helper()
	hits := make(map[string]types.Card, len(cards))
	for _, c := range cards {
		hits[c.Name] = c
	}
	out := map[string]ExplorerCard{}
	for _, c := range exploreCards(hits, newExplorerRules(testRules(t, explorerCube(), config), config), thin) {
		out[c.Name] = c
	}
	return out
}

// joinFor finds the card's join on the named package.
func joinFor(t *testing.T, card ExplorerCard, pkg string) ExplorerJoin {
	t.Helper()
	for _, j := range card.Joins {
		if j.Package == pkg {
			return j
		}
	}
	require.FailNow(t, "no join on "+pkg)
	return ExplorerJoin{}
}

// newOutlet is a candidate creature that is also a sacrifice outlet.
func newOutlet() types.Card {
	return types.Card{Name: "New Outlet", Types: []string{"Creature"}, CMC: 3, Power: "2", Toughness: "3", OracleText: "Sacrifice a creature: You gain 1 life."}
}

func TestExplore_FillsGapsWeightsSides(t *testing.T) {
	got := explore(t, explorerConfig(), 10, newOutlet())["New Outlet"]

	assert.InDelta(t, 1.0/3+1.0/13, got.FillsGaps, 1e-9)
	assert.False(t, got.InCube)
}

func TestExplore_RolesFromKind(t *testing.T) {
	got := explore(t, explorerConfig(), 10, newOutlet())["New Outlet"]
	assert.Equal(t, "payoff", joinFor(t, got, "Sacrifice").Role)
	assert.Equal(t, 2, joinFor(t, got, "Sacrifice").Others)
	assert.Equal(t, "enabler", joinFor(t, got, "Swarm").Role)
	assert.Equal(t, 12, joinFor(t, got, "Swarm").Others)

	config := explorerConfig()
	config.Packages[1].Wires[0].Kind = design.WirePairs
	got = explore(t, config, 10, newOutlet())["New Outlet"]
	assert.Equal(t, "pairs", joinFor(t, got, "Swarm").Role)
}

func TestExplore_CubeCardLeavesItselfOut(t *testing.T) {
	cube := explorerCube()
	got := explore(t, explorerConfig(), 10, cube.Cards[0])["Outlet A"]

	assert.True(t, got.InCube)
	assert.Equal(t, 1, joinFor(t, got, "Sacrifice").Others)
	assert.Equal(t, []string{"Maker A", "Maker B", "Maker C"}, got.Linked)
}

func TestExplore_CardEntryInCube(t *testing.T) {
	config := explorerConfig()
	config.Packages[0].Wires = append(config.Packages[0].Wires, design.Wire{Kind: design.WireEnables, Sources: []string{"Makers"}, Targets: []string{"card:Lone Payoff"}})
	payoff := explorerCube().Cards[6]

	got := explore(t, config, 10, payoff)["Lone Payoff"]

	assert.True(t, got.InCube)
	assert.Equal(t, 0, joinFor(t, got, "Sacrifice").Others)
	assert.InDelta(t, 1.0, got.FillsGaps, 1e-9)
}

func TestExplore_EmptyPartnerDoesNotScore(t *testing.T) {
	config := explorerConfig()
	broken := design.Wire{Kind: design.WireEnables, Sources: []string{"Makers"}, Targets: []string{"Missing"}}
	config.Packages = append(config.Packages, design.Package{Name: "Broken", Wires: []design.Wire{broken}})
	maker := types.Card{Name: "New Maker", Types: []string{"Sorcery"}, OracleText: makerText}

	got := explore(t, config, 10, maker)["New Maker"]

	for _, j := range got.Joins {
		assert.NotEqual(t, "Broken", j.Package)
	}
	assert.InDelta(t, 1.0/4+1.0/4, got.FillsGaps, 1e-9)
}

func TestExplore_BasicPartnerIsStocked(t *testing.T) {
	fetcher := types.Card{Name: "New Fetcher", Types: []string{"Sorcery"}, OracleText: fetcherText}

	got := explore(t, explorerConfig(), 10, fetcher)["New Fetcher"]

	join := joinFor(t, got, "Ramp")
	assert.Equal(t, "payoff", join.Role)
	assert.Equal(t, 1, join.Others)
	assert.True(t, join.PartnerBasics)
	assert.True(t, got.LinkedBasics)
	assert.InDelta(t, 0.5, got.FillsGaps, 1e-9)
}

func TestExplore_ConnectionsNeedThinSides(t *testing.T) {
	odd := types.Card{Name: "Odd Card", Types: []string{"Artifact"}, OracleText: "Sacrifice a creature: Search your library for a basic land card, then shuffle."}

	got := explore(t, explorerConfig(), 10, odd)["Odd Card"]
	assert.Equal(t, []PackageConnection{{A: "Ramp", B: "Sacrifice", Shared: 0}}, got.Connections)

	got = explore(t, explorerConfig(), 0, odd)["Odd Card"]
	assert.Empty(t, got.Connections)
}

func TestExplore_GroupsHonorExcludeAndShowCondition(t *testing.T) {
	got := explore(t, explorerConfig(), 10, newOutlet())["New Outlet"]
	assert.Contains(t, got.Groups, ExplorerGroup{Name: "Outlets", Condition: `o:"sacrifice a creature"`})

	config := explorerConfig()
	config.Groups[0].Exclude = []string{"New Outlet"}
	got = explore(t, config, 10, newOutlet())["New Outlet"]
	for _, g := range got.Groups {
		assert.NotEqual(t, "Outlets", g.Name)
	}
}

func TestExplore_PowerToughnessOnlyForCreatures(t *testing.T) {
	vehicle := types.Card{Name: "Odd Vehicle", Types: []string{"Artifact"}, Power: "3", Toughness: "3", OracleText: outletText}

	got := explore(t, explorerConfig(), 10, vehicle, newOutlet())

	assert.Empty(t, got["Odd Vehicle"].Power)
	assert.Empty(t, got["Odd Vehicle"].Toughness)
	assert.Equal(t, "2", got["New Outlet"].Power)
	assert.Equal(t, "3", got["New Outlet"].Toughness)
}
