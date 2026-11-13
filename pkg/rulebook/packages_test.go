package rulebook

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// resolveTestCube has three blue duals and a bear, enough for a fetch package
// with a single-card side and a two-card side.
func resolveTestCube() *types.Cube {
	return &types.Cube{
		Cards: []types.Card{
			{Name: "Flooded Strand", Colors: []string{}, Types: []string{"Land"}, OracleText: "search your library for a Plains or Island card"},
			{Name: "Hallowed Fountain", Colors: []string{}, Types: []string{"Land"}, OracleText: "plains island"},
			{Name: "Steam Vents", Colors: []string{}, Types: []string{"Land"}, OracleText: "island mountain"},
			{Name: "Bear", Colors: []string{"G"}, Types: []string{"Creature"}, CMC: 2, OracleText: "just a bear", Power: "2", Toughness: "2"},
		},
	}
}

// TestResolvePackages_DanglingGroup checks that a wire naming a group that
// doesn't exist resolves an empty side the package can never be built from.
func TestResolvePackages_DanglingGroup(t *testing.T) {
	config := design.DesignMapConfig{
		Groups: []design.Group{{Name: "Real", Conditions: []string{"o:island t:land"}}},
		Packages: []design.Package{
			{Name: "Broken", Wires: []design.Wire{{Sources: []string{"Real"}, Targets: []string{"Missing"}}}},
		},
	}

	pkgs := load(t, resolveTestCube(), config).Packages()
	require.Len(t, pkgs, 1)
	require.Len(t, pkgs[0].Wires, 1)
	assert.Equal(t, 1, pkgs[0].Wires[0].NeedSources)
	assert.Equal(t, 0, pkgs[0].Wires[0].NeedTargets)

	deck := deckCounts("Flooded Strand", "Hallowed Fountain", "Steam Vents", "Bear")
	assert.False(t, pkgs[0].BuiltBy(deck))
}

// TestResolvePackages_SingleCardRef checks that a card: entry is a one-card
// side, the scarcer one, so it needs 2 and is a build-around that can carry
// itself with enough links.
func TestResolvePackages_SingleCardRef(t *testing.T) {
	config := design.DesignMapConfig{
		Groups: []design.Group{{Name: "Blue Fetchables", Conditions: []string{"o:island t:land"}}},
		Packages: []design.Package{
			{Name: "Fetches", Wires: []design.Wire{{Sources: []string{"card:Flooded Strand"}, Targets: []string{"Blue Fetchables"}}}},
		},
	}

	pkgs := load(t, resolveTestCube(), config).Packages()
	require.Len(t, pkgs, 1)
	w := pkgs[0].Wires[0]
	assert.Equal(t, 2, w.NeedSources)
	assert.Equal(t, 1, w.NeedTargets)
	assert.True(t, w.Buildarounds["Flooded Strand"])
}

// TestResolvePackages_ScarceColumnNeedsTwo checks that the smaller side of a
// wire needs 2 and the larger needs the square-root amount.
func TestResolvePackages_ScarceColumnNeedsTwo(t *testing.T) {
	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Lands", Conditions: []string{"t:land"}},
			{Name: "Bears", Conditions: []string{"t:creature"}},
		},
		Packages: []design.Package{{Name: "P", Wires: []design.Wire{{Sources: []string{"Lands"}, Targets: []string{"Bears"}}}}},
	}

	w := load(t, resolveTestCube(), config).Packages()[0].Wires[0]

	assert.Equal(t, 1, w.NeedSources, "3 lands against 1 bear")
	assert.Equal(t, 2, w.NeedTargets, "the lone bear is the scarce side")
}

// TestResolvePackages_Buildarounds checks the three ways a card becomes a
// build-around: its shape, a group marked buildaround, and a card: entry.
func TestResolvePackages_Buildarounds(t *testing.T) {
	cube := &types.Cube{Cards: []types.Card{
		{Name: "Delney", Types: []string{"Creature"}, OracleText: "Creatures you control with power 2 or less can't be blocked by creatures with power 3 or greater."},
		{Name: "Resto", Types: []string{"Creature"}, OracleText: "Flash\nWhen this creature enters, exile target creature you control, then return it."},
		{Name: "CoCo", Types: []string{"Instant"}, OracleText: "Look at the top six cards of your library."},
		{Name: "Bolt", Types: []string{"Instant"}, OracleText: "Bolt deals 3 damage to any target."},
		{Name: "Field", Types: []string{"Land"}, OracleText: "Whenever this land or another land you control enters, create a 2/2 black Zombie creature token."},
		{Name: "Dual", Types: []string{"Land"}, OracleText: "({T}: Add {U} or {B}.)"},
		{Name: "Rally", Types: []string{"Sorcery"}, OracleText: "Return target creature card."},
	}}
	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Everything", Conditions: []string{"t:creature", "t:instant", "t:land"}},
			{Name: "Cheat", Conditions: []string{"n:CoCo"}, Buildaround: true},
		},
		Packages: []design.Package{{Name: "P", Wires: []design.Wire{{Sources: []string{"Everything"}, Targets: []string{"Cheat", "card:Rally"}}}}},
	}

	w := load(t, cube, config).Packages()[0].Wires[0]

	want := map[string]bool{
		"Delney": true,
		"CoCo":   true,
		"Field":  true,
		"Rally":  true,
	}
	assert.Equal(t, want, w.Buildarounds)
}

// TestResolvePackages_NotBuildaround checks that a group marked
// notBuildaround keeps its cards from being build-arounds by shape, while an
// explicit buildaround group or card: entry still marks them.
func TestResolvePackages_NotBuildaround(t *testing.T) {
	cube := &types.Cube{Cards: []types.Card{
		{Name: "Goyf", Types: []string{"Creature"}, OracleText: "Goyf's power is equal to the number of card types among cards in all graveyards."},
		{Name: "Flayer", Types: []string{"Creature"}, OracleText: "Trample. Whenever this creature deals combat damage to a player, look at the top three cards of your library."},
		{Name: "Delney", Types: []string{"Creature"}, OracleText: "Creatures you control with power 2 or less can't be blocked by creatures with power 3 or greater."},
		{Name: "Mill", Types: []string{"Sorcery"}, OracleText: "Mill three cards."},
	}}
	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Delirium", Conditions: []string{"n:Goyf", "n:Flayer"}, NotBuildaround: true},
			{Name: "Fill", Conditions: []string{"n:Mill"}},
			{Name: "Lookout", Conditions: []string{"n:Delney"}},
		},
		Packages: []design.Package{{Name: "P", Wires: []design.Wire{{Sources: []string{"Fill"}, Targets: []string{"Delirium", "Lookout", "card:Flayer"}}}}},
	}

	w := load(t, cube, config).Packages()[0].Wires[0]

	assert.False(t, w.Buildarounds["Goyf"], "the group keeps Goyf's shape from making it a build-around")
	assert.True(t, w.Buildarounds["Flayer"], "a card: entry still marks Flayer")
	assert.True(t, w.Buildarounds["Delney"], "cards outside the group keep their shape")
}

// TestResolvePackages_CutCardsJoinSides checks that a card cut from the cube
// but present in old decks still counts toward its side, without changing how
// many cards the side needs.
func TestResolvePackages_CutCardsJoinSides(t *testing.T) {
	seedOracle(t, `[
		{"name":"Watery Grave","type_line":"Land","oracle_text":"island swamp","colors":[],"cmc":0}
	]`)

	config := design.DesignMapConfig{
		Groups: []design.Group{{Name: "Blue Fetchables", Conditions: []string{"o:island t:land"}}},
		Packages: []design.Package{
			{Name: "Fetches", Wires: []design.Wire{{Sources: []string{"card:Flooded Strand"}, Targets: []string{"Blue Fetchables"}}}},
		},
	}

	pkgs := load(t, resolveTestCube(), config, "Watery Grave").Packages()
	w := pkgs[0].Wires[0]
	assert.Equal(t, 1, w.NeedTargets, "the cut dual doesn't grow the side past small")
	assert.True(t, w.Targets["Watery Grave"], "cut dual should join the target side")
}

// TestResolvePackages_CutCardRefStillResolves checks that a card: entry for a
// card cut from the cube still resolves for the old decks that played it, as
// a build-around on the scarce side, while an entry no deck ever played stays
// impossible to build.
func TestResolvePackages_CutCardRefStillResolves(t *testing.T) {
	seedOracle(t, `[
		{"name":"Polluted Delta","type_line":"Land","oracle_text":"search your library for an Island or Swamp card","colors":[],"cmc":0}
	]`)
	config := design.DesignMapConfig{
		Groups: []design.Group{{Name: "Blue Fetchables", Conditions: []string{"o:island t:land"}}},
		Packages: []design.Package{
			{Name: "Delta", Wires: []design.Wire{{Sources: []string{"card:Polluted Delta"}, Targets: []string{"Blue Fetchables"}}}},
			{Name: "Typo", Wires: []design.Wire{{Sources: []string{"card:No Such Card"}, Targets: []string{"Blue Fetchables"}}}},
		},
	}

	pkgs := load(t, resolveTestCube(), config, "Polluted Delta").Packages()
	require.Len(t, pkgs, 2)
	delta, typo := pkgs[0], pkgs[1]
	assert.Equal(t, 2, delta.Wires[0].NeedSources)
	assert.True(t, delta.Wires[0].Sources["Polluted Delta"])
	assert.True(t, delta.Wires[0].Buildarounds["Polluted Delta"])
	assert.False(t, delta.BuiltBy(deckCounts("Polluted Delta", "Hallowed Fountain", "Steam Vents")), "2 links is short of 8")

	assert.Equal(t, 0, typo.Wires[0].NeedSources)
	assert.False(t, typo.BuiltBy(deckCounts("Polluted Delta", "Hallowed Fountain", "Steam Vents")))
}

// basicFetcherCube is three cube cards that each search for a basic land.
func basicFetcherCube() *types.Cube {
	text := "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle."
	return &types.Cube{
		Cards: []types.Card{
			{Name: "Fetcher A", Types: []string{"Sorcery"}, OracleText: text},
			{Name: "Fetcher B", Types: []string{"Sorcery"}, OracleText: text},
			{Name: "Fetcher C", Types: []string{"Sorcery"}, OracleText: text},
		},
	}
}

func TestResolvePackages_BasicLandsGroup(t *testing.T) {
	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Fetches basics", Conditions: []string{`o:"a basic land"`}},
			{Name: "Basic lands", Conditions: []string{"t:land t:basic"}},
		},
		Packages: []design.Package{
			{Name: "Fixing", Wires: []design.Wire{{Kind: design.WireEnables, Sources: []string{"Basic lands"}, Targets: []string{"Fetches basics"}}}},
		},
	}

	pkgs := load(t, basicFetcherCube(), config).Packages()
	require.Len(t, pkgs, 1)
	w := pkgs[0].Wires[0]
	assert.True(t, w.SourceBasics["Forest"])
	assert.True(t, w.SourceBasics["Snow-Covered Forest"])
	assert.True(t, w.SourceBasics["Wastes"])
	assert.Empty(t, w.TargetBasics)

	assert.False(t, pkgs[0].BuiltBy(deckCounts("Fetcher A", "Fetcher B", "Forest")))
	assert.True(t, pkgs[0].BuiltBy(deckCounts("Fetcher A", "Fetcher B", "Fetcher C", "Forest")))
}

func TestResolvePackages_ForestsGroupIncludesBasicForest(t *testing.T) {
	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Forests", Conditions: []string{"t:forest"}},
			{Name: "Fetches basics", Conditions: []string{`o:"a basic land"`}},
		},
		Packages: []design.Package{
			{Name: "Fixing", Wires: []design.Wire{{Sources: []string{"Forests"}, Targets: []string{"Fetches basics"}}}},
		},
	}

	pkgs := load(t, basicFetcherCube(), config).Packages()
	assert.Equal(t, cardSet("Forest", "Snow-Covered Forest"), pkgs[0].Wires[0].SourceBasics)
}
