package stats

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/file"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildDesignGraphWithConfig(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Bolt", Colors: []string{"R"}, Types: []string{"Instant"}, CMC: 1, OracleText: "deals 3 damage"},
			{Name: "Bear", Colors: []string{"G"}, Types: []string{"Creature"}, CMC: 2, OracleText: "just a bear", Power: "2", Toughness: "2"},
			{Name: "Sword", Colors: []string{}, Types: []string{"Artifact"}, CMC: 3, OracleText: "equipped creature gets +2/+2"},
		},
	}

	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Red Stuff", Conditions: []string{"c:R"}},
			{Name: "Damage Dealers", Conditions: []string{"o:damage"}},
			{Name: "Artifacts", Conditions: []string{"t:artifact"}},
		},
		Packages: []design.Package{
			{Name: "Red-Damage", Wires: []design.Wire{{Sources: []string{"Red Stuff"}, Targets: []string{"Damage Dealers"}}}},
			{Name: "Artifact Link", Wires: []design.Wire{{Sources: []string{"Artifacts"}, Targets: []string{"Red Stuff"}}}},
		},
	}

	resp := buildDesignGraph(cube, config, nil)

	// Should have all 3 cards as nodes.
	assert.Len(t, resp.Nodes, 3)

	// Red Stuff = {Bolt}, Damage Dealers = {Bolt}. Bolt->Bolt is self-edge, so no edges from first link.
	// Artifacts = {Sword}, Red Stuff = {Bolt}. Sword<->Bolt should create 1 edge.
	assert.Len(t, resp.Edges, 1)
	edge := resp.Edges[0]
	// Normalized: "Bolt" < "Sword"
	assert.Equal(t, "Bolt", edge.Source)
	assert.Equal(t, "Sword", edge.Target)
	assert.Contains(t, edge.Packages, "Artifact Link")

	// Groups and packages should be returned sorted.
	assert.Len(t, resp.Groups, 3)
	assert.Len(t, resp.Packages, 2)
}

// TestBuildDesignGraphSharedGroup verifies that two packages sharing the same
// group produce correct edges for both packages.
func TestBuildDesignGraphSharedGroup(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Mill Card", Colors: []string{"U"}, Types: []string{"Instant"}, CMC: 1, OracleText: "mill three cards"},
			{Name: "Delve Card", Colors: []string{"B"}, Types: []string{"Creature"}, CMC: 5, OracleText: "delve", Power: "4", Toughness: "4"},
			{Name: "Flashback Card", Colors: []string{"R"}, Types: []string{"Sorcery"}, CMC: 2, OracleText: "flashback {R}"},
		},
	}

	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Mill Enablers", Conditions: []string{"o:mill"}},
			{Name: "Delve Payoffs", Conditions: []string{"o:delve"}},
			{Name: "Flashback Payoffs", Conditions: []string{"o:flashback"}},
		},
		Packages: []design.Package{
			{Name: "Delve", Wires: []design.Wire{{Sources: []string{"Delve Payoffs"}, Targets: []string{"Mill Enablers"}}}},
			{Name: "Graveyard Spells", Wires: []design.Wire{{Sources: []string{"Flashback Payoffs"}, Targets: []string{"Mill Enablers"}}}},
		},
	}

	resp := buildDesignGraph(cube, config, nil)

	// Mill Enablers = {Mill Card}, Delve = {Delve Card}, Flashback = {Flashback Card}
	// Edges: Delve Card <-> Mill Card (Delve), Flashback Card <-> Mill Card (Graveyard Spells)
	assert.Len(t, resp.Edges, 2)

	names := map[string]bool{}
	for _, e := range resp.Edges {
		for _, n := range e.Packages {
			names[n] = true
		}
	}
	assert.True(t, names["Delve"])
	assert.True(t, names["Graveyard Spells"])
}

// TestBuildDesignGraphMultiWire verifies that wires within a link stay
// independent: two wires sharing a group don't cross-product with each other.
func TestBuildDesignGraphMultiWire(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Outlet", Colors: []string{"B"}, Types: []string{"Creature"}, CMC: 2, OracleText: "sacrifice a creature", Power: "2", Toughness: "2"},
			{Name: "Payoff", Colors: []string{"B"}, Types: []string{"Enchantment"}, CMC: 3, OracleText: "whenever a creature dies"},
			{Name: "Token Maker", Colors: []string{"W"}, Types: []string{"Sorcery"}, CMC: 2, OracleText: "create two tokens"},
		},
	}

	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Outlets", Conditions: []string{"o:sacrifice"}},
			{Name: "Payoffs", Conditions: []string{"o:dies"}},
			{Name: "Token Makers", Conditions: []string{"o:token"}},
		},
		Packages: []design.Package{
			{
				Name: "Sacrifice",
				Wires: []design.Wire{
					{Sources: []string{"Outlets"}, Targets: []string{"Payoffs"}},
					{Sources: []string{"Token Makers"}, Targets: []string{"Outlets"}},
				},
			},
		},
	}

	resp := buildDesignGraph(cube, config, nil)

	// Outlet<->Payoff and Token Maker<->Outlet, but NOT Token Maker<->Payoff.
	assert.Len(t, resp.Edges, 2)
	pairs := map[string]bool{}
	for _, e := range resp.Edges {
		pairs[e.Source+"|"+e.Target] = true
		assert.Contains(t, e.Packages, "Sacrifice")
	}
	assert.True(t, pairs["Outlet|Payoff"])
	assert.True(t, pairs["Outlet|Token Maker"])

	// Same independence in the link-derived group view.
	assert.Len(t, resp.PackageEdges, 2)
}

// TestBuildGroupGraph verifies the aggregated group-level view: one node per
// group with card counts, and one edge per linked group-pair with the right weight.
func TestBuildGroupGraph(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Mill Card", Colors: []string{"U"}, Types: []string{"Instant"}, CMC: 1, OracleText: "mill three cards"},
			{Name: "Delve Card", Colors: []string{"B"}, Types: []string{"Creature"}, CMC: 5, OracleText: "delve", Power: "4", Toughness: "4"},
			{Name: "Flashback Card", Colors: []string{"R"}, Types: []string{"Sorcery"}, CMC: 2, OracleText: "flashback {R}"},
		},
	}

	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Mill Enablers", Conditions: []string{"o:mill"}},
			{Name: "Delve Payoffs", Conditions: []string{"o:delve"}},
			{Name: "Flashback Payoffs", Conditions: []string{"o:flashback"}},
		},
		Packages: []design.Package{
			{Name: "Delve", Wires: []design.Wire{{Sources: []string{"Delve Payoffs"}, Targets: []string{"Mill Enablers"}}}},
			{Name: "Graveyard Spells", Wires: []design.Wire{{Sources: []string{"Flashback Payoffs"}, Targets: []string{"Mill Enablers"}}}},
		},
	}

	resp := buildDesignGraph(cube, config, nil)

	// One node per group, each matching a single card.
	assert.Len(t, resp.GroupNodes, 3)
	byName := map[string]DesignGraphGroupNode{}
	for _, n := range resp.GroupNodes {
		byName[n.Name] = n
		assert.Equal(t, 1, n.CardCount)
	}
	assert.Equal(t, []string{"Delve Card"}, byName["Delve Payoffs"].Cards)

	// Card-derived edges: Mill Enablers connects to both other groups via real card edges.
	assert.Len(t, resp.GroupEdges, 2)
	for _, e := range resp.GroupEdges {
		assert.Equal(t, 1, e.Weight)
		assert.Equal(t, "Mill Enablers", e.Target)
	}

	// Link-derived edges mirror the two rule definitions, which also point at Mill Enablers.
	assert.Len(t, resp.PackageEdges, 2)
	for _, e := range resp.PackageEdges {
		assert.Equal(t, "Mill Enablers", e.Target)
	}
}

// TestBuildGroupGraphMultiGroupCard verifies that a card belonging to multiple groups
// produces card-derived group edges the raw link definitions don't, since the link
// view only joins groups explicitly named together in a rule.
func TestBuildGroupGraphMultiGroupCard(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			// Bridge is both red and an artifact, so it lands in two groups.
			{Name: "Bridge", Colors: []string{"R"}, Types: []string{"Artifact"}, CMC: 2, OracleText: "tap for mana"},
			{Name: "Payoff", Colors: []string{"G"}, Types: []string{"Creature"}, CMC: 4, OracleText: "ramp payoff", Power: "4", Toughness: "4"},
		},
	}

	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Red", Conditions: []string{"c:R"}},
			{Name: "Artifacts", Conditions: []string{"t:artifact"}},
			{Name: "Ramp Payoffs", Conditions: []string{"o:ramp"}},
		},
		// Only Red is linked to Ramp Payoffs. Artifacts is named in no link.
		Packages: []design.Package{
			{Name: "Ramp", Wires: []design.Wire{{Sources: []string{"Red"}, Targets: []string{"Ramp Payoffs"}}}},
		},
	}

	resp := buildDesignGraph(cube, config, nil)

	// Link view: just the one declared edge Red <-> Ramp Payoffs.
	assert.Len(t, resp.PackageEdges, 1)
	assert.Equal(t, "Ramp", resp.PackageEdges[0].Packages[0])

	// Card view: Bridge is in both Red and Artifacts, so its card-level link to Payoff
	// also pulls Artifacts <-> Ramp Payoffs into the graph.
	pairs := map[string]bool{}
	for _, e := range resp.GroupEdges {
		pairs[e.Source+"|"+e.Target] = true
	}
	assert.True(t, pairs["Ramp Payoffs|Red"], "expected Red <-> Ramp Payoffs")
	assert.True(t, pairs["Artifacts|Ramp Payoffs"] || pairs["Ramp Payoffs|Artifacts"], "expected Artifacts <-> Ramp Payoffs from the multi-group card")
}

// TestBuildDesignGraphCardRef verifies card: wire entries act as single-card
// endpoints: they produce card-level edges, mix with group entries, resolve
// empty for unknown names, and appear in the group graph as kind=card nodes.
func TestBuildDesignGraphCardRef(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Flooded Strand", Colors: []string{}, Types: []string{"Land"}, OracleText: "search your library for a Plains or Island card"},
			{Name: "Hallowed Fountain", Colors: []string{}, Types: []string{"Land"}, OracleText: "plains island"},
			{Name: "Steam Vents", Colors: []string{}, Types: []string{"Land"}, OracleText: "island mountain"},
			{Name: "Bear", Colors: []string{"G"}, Types: []string{"Creature"}, CMC: 2, OracleText: "just a bear", Power: "2", Toughness: "2"},
		},
	}

	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Blue Fetchables", Conditions: []string{"o:island t:land"}},
		},
		Packages: []design.Package{
			{Name: "Fetches", Wires: []design.Wire{{Sources: []string{"card:Flooded Strand"}, Targets: []string{"Blue Fetchables"}}}},
			{Name: "Bogus", Wires: []design.Wire{{Sources: []string{"card:No Such Card"}, Targets: []string{"Blue Fetchables"}}}},
		},
	}

	resp := buildDesignGraph(cube, config, nil)

	// Flooded Strand is itself a Blue Fetchable, so the wire yields edges to the
	// other two duals only; the unknown card ref yields nothing.
	assert.Len(t, resp.Edges, 2)
	pairs := map[string]bool{}
	for _, e := range resp.Edges {
		pairs[e.Source+"|"+e.Target] = true
		assert.Equal(t, []string{"Fetches"}, e.Packages)
	}
	assert.True(t, pairs["Flooded Strand|Hallowed Fountain"])
	assert.True(t, pairs["Flooded Strand|Steam Vents"])

	// Group graph: the real group plus one pseudo-node per card ref.
	byName := map[string]DesignGraphGroupNode{}
	for _, n := range resp.GroupNodes {
		byName[n.Name] = n
	}
	assert.Equal(t, "group", byName["Blue Fetchables"].Kind)
	assert.Equal(t, "card", byName["card:Flooded Strand"].Kind)
	assert.Equal(t, []string{"Flooded Strand"}, byName["card:Flooded Strand"].Cards)
	assert.Equal(t, "card", byName["card:No Such Card"].Kind)
	assert.Equal(t, 0, byName["card:No Such Card"].CardCount)

	// Both group edge views join the card ref to the group it fetches.
	assert.Len(t, resp.PackageEdges, 2)
	packagePairs := map[string]bool{}
	for _, e := range resp.PackageEdges {
		packagePairs[e.Source+"|"+e.Target] = true
	}
	assert.True(t, packagePairs["Blue Fetchables|card:Flooded Strand"])
	assert.Len(t, resp.GroupEdges, 1)
	assert.Equal(t, "Blue Fetchables", resp.GroupEdges[0].Source)
	assert.Equal(t, "card:Flooded Strand", resp.GroupEdges[0].Target)
}

// TestBuildDesignGraphCardRefMixed verifies a wire can mix card refs and group
// names on the same side, unioning their members.
func TestBuildDesignGraphCardRefMixed(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Fetch", Colors: []string{}, Types: []string{"Land"}, OracleText: "search your library"},
			{Name: "Tutor", Colors: []string{"B"}, Types: []string{"Sorcery"}, CMC: 1, OracleText: "search your library for a card"},
			{Name: "Payoff", Colors: []string{"U"}, Types: []string{"Creature"}, CMC: 3, OracleText: "shuffle payoff", Power: "2", Toughness: "2"},
		},
	}

	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Tutors", Conditions: []string{"t:sorcery"}},
			{Name: "Shuffle Payoffs", Conditions: []string{"o:shuffle"}},
		},
		Packages: []design.Package{
			{Name: "Shuffles", Wires: []design.Wire{{Sources: []string{"card:Fetch", "Tutors"}, Targets: []string{"Shuffle Payoffs"}}}},
		},
	}

	resp := buildDesignGraph(cube, config, nil)

	assert.Len(t, resp.Edges, 2)
	pairs := map[string]bool{}
	for _, e := range resp.Edges {
		pairs[e.Source+"|"+e.Target] = true
	}
	assert.True(t, pairs["Fetch|Payoff"])
	assert.True(t, pairs["Payoff|Tutor"])
}

// TestBuildDesignGraphExclude verifies a group's exclude list carves cards out
// of its condition matches: no edges, not a member, but reported on the group
// node so the editor can offer a restore.
func TestBuildDesignGraphExclude(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Bolt", Colors: []string{"R"}, Types: []string{"Instant"}, CMC: 1, OracleText: "deals 3 damage"},
			{Name: "Goblin", Colors: []string{"R"}, Types: []string{"Creature"}, CMC: 1, OracleText: "haste", Power: "2", Toughness: "2"},
			{Name: "Bear", Colors: []string{"G"}, Types: []string{"Creature"}, CMC: 2, OracleText: "just a bear", Power: "2", Toughness: "2"},
		},
	}

	config := design.DesignMapConfig{
		Groups: []design.Group{
			// "No Such Card" exercises a stale exclude: ignored, not reported.
			{Name: "Red Stuff", Conditions: []string{"c:R"}, Exclude: []string{"Bolt", "No Such Card"}},
			{Name: "Creatures", Conditions: []string{"t:creature"}},
		},
		Packages: []design.Package{
			{Name: "Red-Creature", Wires: []design.Wire{{Sources: []string{"Red Stuff"}, Targets: []string{"Creatures"}}}},
		},
	}

	resp := buildDesignGraph(cube, config, nil)

	// Bolt is excluded from Red Stuff, so the only source card is Goblin.
	// Goblin is also a Creature (self-edge skipped), leaving Goblin<->Bear.
	assert.Len(t, resp.Edges, 1)
	assert.Equal(t, "Bear", resp.Edges[0].Source)
	assert.Equal(t, "Goblin", resp.Edges[0].Target)

	byName := map[string]DesignGraphGroupNode{}
	for _, n := range resp.GroupNodes {
		byName[n.Name] = n
	}
	assert.Equal(t, []string{"Goblin"}, byName["Red Stuff"].Cards)
	assert.Equal(t, 1, byName["Red Stuff"].CardCount)
	assert.Equal(t, []string{"Bolt"}, byName["Red Stuff"].ExcludedCards)
	assert.Empty(t, byName["Creatures"].ExcludedCards)
}

// TestMatchConditionsExcluded verifies the match endpoint marks (not drops)
// conditions whose owning group excludes the card, and only for that group.
func TestMatchConditionsExcluded(t *testing.T) {
	cards := map[string]types.Card{
		"Bolt": {
			Name: "Lightning Bolt", Colors: []string{"R"},
			Types: []string{"Instant"}, CMC: 1,
			OracleText: "Lightning Bolt deals 3 damage to any target.",
		},
		"Goblin": {
			Name: "Goblin Guide", Colors: []string{"R"},
			Types: []string{"Creature"}, CMC: 1,
			OracleText: "Haste", Power: "2", Toughness: "2",
		},
	}

	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Red Cards", Conditions: []string{"c:R"}, Exclude: []string{"Bolt"}},
			{Name: "Damage", Conditions: []string{"o:damage"}},
		},
	}
	req := DesignGraphMatchRequest{
		Conditions: []string{"c:R", "o:damage"},
		Groups:     []string{"Red Cards", "Damage"},
	}

	matched := matchConditions(cards, config, req)

	byName := map[string][]MatchedCondition{}
	for _, c := range matched {
		byName[c.Name] = c.Conditions
	}

	// Bolt still appears, with the Red Cards condition marked excluded but the
	// Damage condition untouched.
	assert.Len(t, byName["Bolt"], 2)
	for _, mc := range byName["Bolt"] {
		assert.Equal(t, mc.Group == "Red Cards", mc.Excluded)
	}

	// Goblin matches Red Cards and isn't excluded.
	assert.Len(t, byName["Goblin"], 1)
	assert.False(t, byName["Goblin"][0].Excluded)

	// No groups in the request (the group edit modal's raw preview) means no
	// exclusion marking at all.
	rawReq := DesignGraphMatchRequest{Conditions: []string{"c:R"}}
	for _, c := range matchConditions(cards, config, rawReq) {
		for _, mc := range c.Conditions {
			assert.False(t, mc.Excluded)
		}
	}
}

func TestMatchCardsWithConditions(t *testing.T) {
	cards := map[string]types.Card{
		"Bolt": {
			Name: "Lightning Bolt", Colors: []string{"R"},
			Types: []string{"Instant"}, CMC: 1,
			OracleText: "Lightning Bolt deals 3 damage to any target.",
		},
		"Bear": {
			Name: "Grizzly Bears", Colors: []string{"G"},
			Types: []string{"Creature"}, CMC: 2,
			OracleText: "Just a bear.", Power: "2", Toughness: "2",
		},
		"Goblin": {
			Name: "Goblin Guide", Colors: []string{"R"},
			Types: []string{"Creature"}, CMC: 1,
			OracleText: "Haste", Power: "2", Toughness: "2",
		},
	}

	conditions := []string{"c:R", "t:creature"}
	groups := []string{"Red Cards", "Creatures"}

	// Build per-card condition map the same way the handler does.
	cardConditions := make(map[string][]MatchedCondition)
	for i, cond := range conditions {
		group := ""
		if i < len(groups) {
			group = groups[i]
		}
		for name := range matchCards(cards, cond) {
			cardConditions[name] = append(cardConditions[name], MatchedCondition{
				Condition: cond,
				Group:     group,
			})
		}
	}

	// Bolt: matches c:R only (it's an Instant, not a Creature).
	boltConds := cardConditions["Bolt"]
	assert.Len(t, boltConds, 1)
	assert.Equal(t, "c:R", boltConds[0].Condition)
	assert.Equal(t, "Red Cards", boltConds[0].Group)

	// Bear: matches t:creature only (it's Green, not Red).
	bearConds := cardConditions["Bear"]
	assert.Len(t, bearConds, 1)
	assert.Equal(t, "t:creature", bearConds[0].Condition)
	assert.Equal(t, "Creatures", bearConds[0].Group)

	// Goblin: matches both c:R and t:creature.
	goblinConds := cardConditions["Goblin"]
	assert.Len(t, goblinConds, 2)
	condStrs := []string{goblinConds[0].Condition, goblinConds[1].Condition}
	assert.ElementsMatch(t, []string{"c:R", "t:creature"}, condStrs)
	groupStrs := []string{goblinConds[0].Group, goblinConds[1].Group}
	assert.ElementsMatch(t, []string{"Red Cards", "Creatures"}, groupStrs)
}

func TestMatchCards(t *testing.T) {
	cards := map[string]types.Card{
		"Bolt": {
			Name: "Lightning Bolt", Colors: []string{"R"},
			Types: []string{"Instant"}, CMC: 1, ManaCost: "{R}",
			OracleText: "Lightning Bolt deals 3 damage to any target.",
		},
		"Bear": {
			Name: "Grizzly Bears", Colors: []string{"G"},
			Types: []string{"Creature"}, SubTypes: []string{"Bear"}, CMC: 2, ManaCost: "{1}{G}",
			OracleText: "Just a bear.", Power: "2", Toughness: "2",
		},
		"Sword": {
			Name: "Sword of Fire", Colors: []string{},
			Types: []string{"Artifact"}, SubTypes: []string{"Equipment"}, CMC: 3, ManaCost: "{3}",
			OracleText: "Equipped creature gets +2/+2.",
		},
		"Enchant": {
			Name: "Pacifism", Colors: []string{"W"},
			Types: []string{"Enchantment"}, CMC: 2, ManaCost: "{1}{W}",
			OracleText: "Enchanted creature can't attack or block.",
		},
		"Fireball": {
			Name: "Fireball", Colors: []string{"R"},
			Types: []string{"Sorcery"}, CMC: 1, ManaCost: "{X}{R}",
			OracleText: "Fireball deals X damage.",
		},
	}

	tests := []struct {
		name     string
		query    string
		expected []string
	}{
		{"simple name", "n:bolt", []string{"Bolt"}},
		{"oracle text", "o:damage", []string{"Bolt", "Fireball"}},
		{"type", "t:creature", []string{"Bear"}},
		{"subtype", "st:equipment", []string{"Sword"}},
		{"color", "c:R", []string{"Bolt", "Fireball"}},
		{"cmc equals", "cmc:2", []string{"Bear", "Enchant"}},
		{"cmc lte", "cmc<=1", []string{"Bolt", "Fireball"}},
		{"cmc gte", "cmc>=3", []string{"Sword"}},
		{"simple OR", "t:creature OR t:artifact", []string{"Bear", "Sword"}},
		{"simple AND", "c:G t:creature", []string{"Bear"}},
		{"parens with OR then AND", "(t:enchantment OR t:artifact) cmc<=2", []string{"Enchant"}},
		{"parens complex", "(c:R OR c:G) t:creature", []string{"Bear"}},
		{"negation", "!t:creature", []string{"Bolt", "Sword", "Enchant", "Fireball"}},
		{"negation with AND", "!t:creature cmc<=2", []string{"Bolt", "Enchant", "Fireball"}},
		{"negated group", "!(t:creature OR t:instant)", []string{"Sword", "Enchant", "Fireball"}},
		{"explicit AND keyword", "t:creature AND c:G", []string{"Bear"}},
		{"is keyword", "is:creature", []string{"Bear"}},
		{"quoted phrase", `o:"deals 3 damage"`, []string{"Bolt"}},
		{"cmc lt", "cmc<2", []string{"Bolt", "Fireball"}},
		{"cmc gt", "cmc>2", []string{"Sword"}},
		{"mana cost X", "m:X", []string{"Fireball"}},
		{"mana cost color", "m:{W}", []string{"Enchant"}},
		{"wildcard oracle", `o:"deals * damage"`, []string{"Bolt", "Fireball"}},
		{"wildcard name", "n:*bolt", []string{"Bolt"}},
		{"wildcard no match", "o:*flying*", []string{}},
		{"wildcard mana cost", "m:{*}{G}", []string{"Bear"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := matchCards(cards, tt.query)
			var got []string
			for name := range result {
				got = append(got, name)
			}
			assert.ElementsMatch(t, tt.expected, got)
		})
	}
}

// TestBuildDesignGraphIncludesCutCards verifies that a card appearing in a deck
// but cut from the cube still resolves group membership and keeps its edges, so
// old decks don't render it disconnected. The cube view stays cube-only: the cut
// card is not a node and doesn't inflate a cube card's connection count.
func TestBuildDesignGraphIncludesCutCards(t *testing.T) {
	seedOracle(t, `[
		{"name":"Shock","type_line":"Instant","oracle_text":"Shock deals 2 damage to any target.","colors":["R"],"cmc":1}
	]`)

	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Bear", Colors: []string{"G"}, Types: []string{"Creature"}, CMC: 2, OracleText: "vanilla", Power: "2", Toughness: "2"},
		},
	}
	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Creatures", Conditions: []string{"t:creature"}},
			{Name: "Burn", Conditions: []string{"o:damage"}},
		},
		Packages: []design.Package{
			{Name: "Burn-Creature", Wires: []design.Wire{{Sources: []string{"Burn"}, Targets: []string{"Creatures"}}}},
		},
	}

	// Without the deck card, Shock isn't known, so there's no edge.
	base := buildDesignGraph(cube, config, nil)
	assert.Empty(t, base.Edges)

	// With Shock referenced by a deck, the cut card resolves into "Burn" and
	// connects to Bear.
	resp := buildDesignGraph(cube, config, []string{"Shock"})
	require.Len(t, resp.Edges, 1)
	edge := resp.Edges[0]
	assert.Equal(t, "Bear", edge.Source) // "Bear" < "Shock"
	assert.Equal(t, "Shock", edge.Target)

	// Cube view unchanged: only Bear is a node, and the cut-card edge doesn't
	// count toward Bear's connection total.
	require.Len(t, resp.Nodes, 1)
	assert.Equal(t, "Bear", resp.Nodes[0].Name)
	assert.Equal(t, 0, resp.Nodes[0].ConnectionCount)
}

func TestDesignGraphForCube(t *testing.T) {
	// data/ paths resolve from the repo root, three levels up from this package.
	t.Chdir("../../..")

	resp, err := DesignGraphForCube(file.NewStore(testCubeSource{}), testCubeSource{}, "polyverse")
	require.NoError(t, err)
	require.NotEmpty(t, resp.Nodes, "expected card nodes from the polyverse cube")
	require.NotEmpty(t, resp.Edges, "expected rule-derived edges from cube-rules.json")

	for _, e := range resp.Edges {
		require.NotEmpty(t, e.Source)
		require.NotEmpty(t, e.Target)
		require.GreaterOrEqual(t, e.Weight, 1)
	}
}

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

	pkgs := resolvePackages(resolveTestCube(), config, nil)
	require.Len(t, pkgs, 1)
	require.Len(t, pkgs[0].Wires, 1)
	assert.Equal(t, 2, pkgs[0].Wires[0].NeedSources)
	assert.Equal(t, 0, pkgs[0].Wires[0].NeedTargets)

	deck := map[string]bool{
		"Flooded Strand":    true,
		"Hallowed Fountain": true,
		"Steam Vents":       true,
		"Bear":              true,
	}
	assert.False(t, pkgs[0].BuiltBy(deck))
}

// TestResolvePackages_SingleCardRef checks that a card: entry is a one-card
// side needing only that card, while a group side of three needs two.
func TestResolvePackages_SingleCardRef(t *testing.T) {
	config := design.DesignMapConfig{
		Groups: []design.Group{{Name: "Blue Fetchables", Conditions: []string{"o:island t:land"}}},
		Packages: []design.Package{
			{Name: "Fetches", Wires: []design.Wire{{Sources: []string{"card:Flooded Strand"}, Targets: []string{"Blue Fetchables"}}}},
		},
	}

	pkgs := resolvePackages(resolveTestCube(), config, nil)
	require.Len(t, pkgs, 1)
	w := pkgs[0].Wires[0]
	assert.Equal(t, 1, w.NeedSources)
	assert.Equal(t, 2, w.NeedTargets)
	assert.True(t, pkgs[0].BuiltBy(cardSet("Flooded Strand", "Hallowed Fountain", "Steam Vents")))
	assert.False(t, pkgs[0].BuiltBy(cardSet("Hallowed Fountain", "Steam Vents", "Bear")))
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

	pkgs := resolvePackages(resolveTestCube(), config, []string{"Watery Grave"})
	w := pkgs[0].Wires[0]
	assert.Equal(t, 2, w.NeedTargets)
	assert.True(t, w.Targets["Watery Grave"], "cut dual should join the target side")
}

// seedOracle loads oracle data holding only the given cards, so a cut card
// hydrates the same way on every run, and empties it again when the test ends.
func seedOracle(t *testing.T, cardsJSON string) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "oracle-cards.json")
	require.NoError(t, os.WriteFile(path, []byte(cardsJSON), 0o644))
	require.NoError(t, types.LoadOracleData(path))
	t.Cleanup(func() {
		empty := filepath.Join(dir, "empty.json")
		if err := os.WriteFile(empty, []byte("[]"), 0o644); err != nil {
			t.Logf("could not write empty oracle data: %v", err)
			return
		}
		if err := types.LoadOracleData(empty); err != nil {
			t.Logf("could not reset oracle data: %v", err)
		}
	})
}

// savedRulesStore holds one cube with one group and one package, for the save
// handler tests.
func savedRulesStore() *storage.Store {
	return memory.NewStore(func(b *memory.Backend) {
		b.SeedRules("testcube", &design.DesignMapConfig{
			Groups:   []design.Group{{Name: "Graveyard", Conditions: []string{"o:graveyard"}}},
			Packages: []design.Package{{Name: "Graveyard", Wires: []design.Wire{{Sources: []string{"Graveyard"}, Targets: []string{"Graveyard"}}}}},
		})
	})
}

// TestSaveDesignRules_RoundTrip checks that rules saved in the current format
// load back with every group and package.
func TestSaveDesignRules_RoundTrip(t *testing.T) {
	store := savedRulesStore()
	body := `{"groups":[{"name":"Ramp","conditions":["o:add"]}],"packages":[{"name":"Ramp","wires":[{"sources":["Ramp"],"targets":["Ramp"]}]}]}`

	rec := serve(t, SaveDesignRulesHandler(store), http.MethodPost, "/api/testcube/save-design-rules", body)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	got, err := store.GetRules("testcube")
	require.NoError(t, err)
	require.Len(t, got.Packages, 1)
	assert.Equal(t, "Ramp", got.Packages[0].Name)
	assert.Equal(t, []string{"Ramp"}, got.Packages[0].Wires[0].Sources)
}

// TestSaveDesignRules_RejectsOldFormat checks that a save from a page still
// running the old UI, which sends "links" with "label"s, is refused rather
// than silently writing the rules with no packages.
func TestSaveDesignRules_RejectsOldFormat(t *testing.T) {
	store := savedRulesStore()
	body := `{"groups":[{"name":"Graveyard","conditions":["o:graveyard"]}],"links":[{"label":"Graveyard","wires":[{"sources":["Graveyard"],"targets":["Graveyard"]}]}]}`

	rec := serve(t, SaveDesignRulesHandler(store), http.MethodPost, "/api/testcube/save-design-rules", body)
	assert.Equal(t, http.StatusBadRequest, rec.Code)

	got, err := store.GetRules("testcube")
	require.NoError(t, err)
	require.Len(t, got.Packages, 1, "the saved package survives a rejected save")
}

// TestResolvePackages_CutCardRefStillBuilds checks that a card: entry for a
// card cut from the cube still counts for the old decks that played it, while
// an entry no deck ever played stays impossible to build.
func TestResolvePackages_CutCardRefStillBuilds(t *testing.T) {
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

	pkgs := resolvePackages(resolveTestCube(), config, []string{"Polluted Delta"})
	require.Len(t, pkgs, 2)
	delta, typo := pkgs[0], pkgs[1]
	assert.Equal(t, 1, delta.Wires[0].NeedSources)
	assert.True(t, delta.BuiltBy(cardSet("Polluted Delta", "Hallowed Fountain", "Steam Vents")))

	assert.Equal(t, 0, typo.Wires[0].NeedSources)
	assert.False(t, typo.BuiltBy(cardSet("Polluted Delta", "Hallowed Fountain", "Steam Vents")))
}

// otagCase is one otag: query and the cards it should match.
type otagCase struct {
	query string
	want  []string
}

func TestMatchCards_Otag(t *testing.T) {
	require.NoError(t, types.LoadOracleTags("../../types/testdata/oracle-tags.jsonl"))
	cards := map[string]types.Card{
		"Bolt":  {Name: "Lightning Bolt", OracleTags: []string{"cycle", "removal", "removal-creature"}},
		"Mill":  {Name: "Stitcher's Supplier", OracleTags: []string{"mill-self"}},
		"Plain": {Name: "Grizzly Bears"},
	}

	tests := []otagCase{
		{"otag:removal", []string{"Bolt"}},
		{"otag:creature-removal", []string{"Bolt"}},
		{`otag:"self mill"`, []string{"Mill"}},
		{"otag:Mill-Self", []string{"Mill"}},
		{"!otag:removal", []string{"Mill", "Plain"}},
		{"otag:nope", nil},
	}
	for _, tt := range tests {
		t.Run(tt.query, func(t *testing.T) {
			var got []string
			for name := range matchCards(cards, tt.query) {
				got = append(got, name)
			}
			assert.ElementsMatch(t, tt.want, got)
		})
	}
}

// TestBuildCardEdges_PackagesSorted pins each card edge's package names in
// name order, so the map colors an edge the same way on every load.
func TestBuildCardEdges_PackagesSorted(t *testing.T) {
	groupCards := map[string]map[string]bool{
		"Left":  {"Ragavan": true},
		"Right": {"Bolt": true},
	}
	var packages []design.Package
	for _, name := range []string{"Zoo", "Tempo", "Ramp", "Mill", "Delve", "Burn", "Aggro"} {
		packages = append(packages, design.Package{Name: name, Wires: []design.Wire{{Sources: []string{"Left"}, Targets: []string{"Right"}}}})
	}

	for range 20 {
		edges := buildCardEdges(packages, groupCards)
		require.Len(t, edges, 1)
		assert.Equal(t, []string{"Aggro", "Burn", "Delve", "Mill", "Ramp", "Tempo", "Zoo"}, edges[0].Packages)
	}
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

	pkgs := resolvePackages(basicFetcherCube(), config, nil)
	require.Len(t, pkgs, 1)
	w := pkgs[0].Wires[0]
	assert.True(t, w.SourceBasics["Forest"])
	assert.True(t, w.SourceBasics["Snow-Covered Forest"])
	assert.True(t, w.SourceBasics["Wastes"])
	assert.Empty(t, w.TargetBasics)

	assert.False(t, pkgs[0].BuiltBy(cardSet("Fetcher A", "Fetcher B", "Forest")))
	assert.True(t, pkgs[0].BuiltBy(cardSet("Fetcher A", "Fetcher B", "Fetcher C", "Forest")))
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

	pkgs := resolvePackages(basicFetcherCube(), config, nil)
	assert.Equal(t, cardSet("Forest", "Snow-Covered Forest"), pkgs[0].Wires[0].SourceBasics)
}

func TestGroupCards_MatchesConditionsAndExclude(t *testing.T) {
	cards := map[string]types.Card{
		"Bear": {Name: "Bear", Types: []string{"Creature"}},
		"Elk":  {Name: "Elk", Types: []string{"Creature"}},
		"Bolt": {Name: "Bolt", Types: []string{"Instant"}},
	}
	groups := []design.Group{{Name: "Creatures", Conditions: []string{"t:creature"}, Exclude: []string{"Elk"}}}

	got := GroupCards(cards, groups)

	assert.Equal(t, map[string]bool{"Bear": true}, got["Creatures"])
}

func TestMatchCards_Face(t *testing.T) {
	fire := types.Card{Name: "Fire", Types: []string{"Instant"}, CMC: 2}
	ice := types.Card{Name: "Ice", Types: []string{"Instant"}, CMC: 2}
	mouse := types.Card{Name: "Cheeky House-Mouse", Types: []string{"Creature"}, CMC: 1}
	squeak := types.Card{Name: "Squeak By", Types: []string{"Sorcery"}, CMC: 1}
	cards := map[string]types.Card{
		"Fire // Ice":                     {Name: "Fire // Ice", Types: []string{"Instant"}, CMC: 4, Faces: []types.Card{fire, ice}},
		"Cheeky House-Mouse // Squeak By": {Name: "Cheeky House-Mouse // Squeak By", Types: []string{"Creature", "Sorcery"}, CMC: 1, Faces: []types.Card{mouse, squeak}},
		"Lightning Bolt":                  {Name: "Lightning Bolt", Types: []string{"Instant"}, CMC: 1},
		"Grizzly Bears":                   {Name: "Grizzly Bears", Types: []string{"Creature"}, CMC: 2},
	}

	assert.Equal(t, map[string]bool{"Lightning Bolt": true}, matchCards(cards, "t:instant cmc<3"))
	assert.Equal(t, map[string]bool{"Fire // Ice": true, "Lightning Bolt": true}, matchCards(cards, "face:(t:instant cmc<3)"))
	assert.Equal(t, map[string]bool{"Cheeky House-Mouse // Squeak By": true, "Fire // Ice": true, "Lightning Bolt": true}, matchCards(cards, "face:(!t:creature cmc<3)"))
	assert.Equal(t, map[string]bool{"Grizzly Bears": true}, matchCards(cards, "!face:(!t:creature cmc<3)"))
}

func TestMatchCards_SelfReference(t *testing.T) {
	cards := map[string]types.Card{
		"Primeval Titan":         {Name: "Primeval Titan", OracleText: "When Primeval Titan enters or attacks, search your library for up to two land cards."},
		"Kiora, the Rising Tide": {Name: "Kiora, the Rising Tide", OracleText: "When Kiora enters, draw two cards, then discard two cards."},
		"Wall of Omens":          {Name: "Wall of Omens", OracleText: "Defender\nWhen this creature enters, draw a card."},
		"Embercleave":            {Name: "Embercleave", OracleText: "When this Equipment enters, attach it to target creature you control."},
		"Soul Warden":            {Name: "Soul Warden", OracleText: "Whenever another creature enters, you gain 1 life."},
	}

	got := matchCards(cards, `o:"when ~ enters"`)

	assert.Equal(t, map[string]bool{"Primeval Titan": true, "Kiora, the Rising Tide": true, "Wall of Omens": true, "Embercleave": true}, got)
}
