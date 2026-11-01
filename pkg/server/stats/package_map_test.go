package stats

import (
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
)

// packageMapFor serves the package page for name over config and
// sacrificeDecks, with extra query params, and returns its map.
func packageMapFor(t *testing.T, config design.DesignMapConfig, name string, extra url.Values) (string, PackageMap) {
	t.Helper()
	store := &rulesDeckStorage{mockDeckStorage: mockDeckStorage{decks: sacrificeDecks()}, config: config}
	params := url.Values{"name": {name}}
	for k, v := range extra {
		params[k] = v
	}
	body, code, resp := packagePageFor(t, store, params)
	require.Equal(t, http.StatusOK, code)
	return body, resp.Map
}

// mapGroup finds the named entry on the map.
func mapGroup(t *testing.T, m PackageMap, name string) MapGroup {
	t.Helper()
	for _, g := range m.Groups {
		if g.Name == name {
			return g
		}
	}
	require.FailNow(t, "no map group named "+name)
	return MapGroup{}
}

func TestPackageMap_Wires(t *testing.T) {
	_, m := packageMapFor(t, sacrificeRules("Sacrifice"), "Sacrifice", nil)

	require.Len(t, m.Wires, 1)
	wire := m.Wires[0]
	assert.Equal(t, []string{"Outlets"}, wire.Sources)
	assert.Equal(t, []string{"Payoffs", "Fodder"}, wire.Targets)
	assert.Equal(t, 2, wire.Decks)
	assert.Equal(t, 2, wire.TypicalPairs)
	assert.Equal(t, 2, m.TypicalPairs)

	require.Len(t, wire.Depth, 1)
	assert.Equal(t, 1, wire.Depth[0].A)
	assert.Equal(t, 2, wire.Depth[0].B)
	assert.Equal(t, 2, wire.Depth[0].Count)
	assert.Len(t, wire.Depth[0].Decks, 2)
}

func TestPackageMap_Flags(t *testing.T) {
	config := sacrificeRules("Sacrifice")
	config.Packages[1].Wires[0].Targets = append(config.Packages[1].Wires[0].Targets, "card:Not A Real Card")
	config.Packages[1].Wires = append(config.Packages[1].Wires, design.Wire{Sources: []string{"Outlets"}, Targets: []string{"Ghost"}})

	_, m := packageMapFor(t, config, "Burn", nil)

	bolt := mapGroup(t, m, "card:Lightning Bolt")
	assert.True(t, bolt.CardEntry)
	assert.Equal(t, 1, bolt.Cards)
	assert.False(t, bolt.Missing)
	assert.True(t, mapGroup(t, m, "card:Not A Real Card").Missing)
	assert.True(t, mapGroup(t, m, "Ghost").Missing)

	fodder := mapGroup(t, m, "Fodder")
	assert.True(t, fodder.OneCard)
	assert.Equal(t, []string{"Sacrifice"}, fodder.OtherPackages)
}

func TestPackageMap_SelfLinked(t *testing.T) {
	config := sacrificeRules("Sacrifice")
	config.Packages[0].Wires[0] = design.Wire{Sources: []string{"Outlets", "Payoffs"}, Targets: []string{"Payoffs", "Fodder"}}

	// Each deck plays 2 cards per side with Mayhem Devil on both: 2×2 − 1 = 3.
	_, m := packageMapFor(t, config, "Sacrifice", nil)
	assert.Equal(t, []string{"Mayhem Devil"}, m.Wires[0].SelfLinked)
	assert.Equal(t, 3, m.TypicalPairs)
}

func TestPackageMap_NoBuilders(t *testing.T) {
	store := &rulesDeckStorage{config: sacrificeRules("Sacrifice")}
	body, code, resp := packagePageFor(t, store, url.Values{"name": {"Sacrifice"}})
	require.Equal(t, http.StatusOK, code)

	for _, w := range resp.Map.Wires {
		assert.Equal(t, 0, w.Decks)
		assert.Equal(t, 0, w.TypicalPairs)
		assert.Equal(t, []DepthCell{}, w.Depth)
	}
	assert.Equal(t, 0, resp.Map.TypicalPairs)
	assert.NotContains(t, body, "null")
}

func TestPackageMap_WireKind(t *testing.T) {
	config := sacrificeRules("Sacrifice")
	config.Packages[0].Wires[0].Kind = design.WireEnables
	config.Packages[0].Wires = append(config.Packages[0].Wires, design.Wire{Sources: []string{"Fodder"}, Targets: []string{"Payoffs"}})

	_, m := packageMapFor(t, config, "Sacrifice", nil)

	require.Len(t, m.Wires, 2)
	assert.Equal(t, design.WireEnables, m.Wires[0].Kind)
	assert.Equal(t, design.WirePairs, m.Wires[1].Kind)
}
