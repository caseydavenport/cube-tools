package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

func TestBuildDesignGraphWithConfig(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Bolt", Colors: []string{"R"}, Types: []string{"Instant"}, CMC: 1, OracleText: "deals 3 damage"},
			{Name: "Bear", Colors: []string{"G"}, Types: []string{"Creature"}, CMC: 2, OracleText: "just a bear", Power: "2", Toughness: "2"},
			{Name: "Sword", Colors: []string{}, Types: []string{"Artifact"}, CMC: 3, OracleText: "equipped creature gets +2/+2"},
		},
	}

	config := DesignMapConfig{
		Groups: []Group{
			{Name: "Red Stuff", Conditions: []string{"c:R"}},
			{Name: "Damage Dealers", Conditions: []string{"o:damage"}},
			{Name: "Artifacts", Conditions: []string{"t:artifact"}},
		},
		Links: []Link{
			{Label: "Red-Damage", Sources: []string{"Red Stuff"}, Targets: []string{"Damage Dealers"}},
			{Label: "Artifact Link", Sources: []string{"Artifacts"}, Targets: []string{"Red Stuff"}},
		},
	}

	resp := buildDesignGraph(cube, config)

	// Should have all 3 cards as nodes.
	assert.Len(t, resp.Nodes, 3)

	// Red Stuff = {Bolt}, Damage Dealers = {Bolt}. Bolt->Bolt is self-edge, so no edges from first link.
	// Artifacts = {Sword}, Red Stuff = {Bolt}. Sword<->Bolt should create 1 edge.
	assert.Len(t, resp.Edges, 1)
	edge := resp.Edges[0]
	// Normalized: "Bolt" < "Sword"
	assert.Equal(t, "Bolt", edge.Source)
	assert.Equal(t, "Sword", edge.Target)
	assert.Contains(t, edge.RuleLabels, "Artifact Link")

	// Groups and links should be returned sorted.
	assert.Len(t, resp.Groups, 3)
	assert.Len(t, resp.Links, 2)
}

// TestBuildDesignGraphSharedGroup verifies that two links sharing the same
// group produce correct edges for both links.
func TestBuildDesignGraphSharedGroup(t *testing.T) {
	cube := &types.Cube{
		Cards: []types.Card{
			{Name: "Mill Card", Colors: []string{"U"}, Types: []string{"Instant"}, CMC: 1, OracleText: "mill three cards"},
			{Name: "Delve Card", Colors: []string{"B"}, Types: []string{"Creature"}, CMC: 5, OracleText: "delve", Power: "4", Toughness: "4"},
			{Name: "Flashback Card", Colors: []string{"R"}, Types: []string{"Sorcery"}, CMC: 2, OracleText: "flashback {R}"},
		},
	}

	config := DesignMapConfig{
		Groups: []Group{
			{Name: "Mill Enablers", Conditions: []string{"o:mill"}},
			{Name: "Delve Payoffs", Conditions: []string{"o:delve"}},
			{Name: "Flashback Payoffs", Conditions: []string{"o:flashback"}},
		},
		Links: []Link{
			{Label: "Delve", Sources: []string{"Delve Payoffs"}, Targets: []string{"Mill Enablers"}},
			{Label: "Graveyard Spells", Sources: []string{"Flashback Payoffs"}, Targets: []string{"Mill Enablers"}},
		},
	}

	resp := buildDesignGraph(cube, config)

	// Mill Enablers = {Mill Card}, Delve = {Delve Card}, Flashback = {Flashback Card}
	// Edges: Delve Card <-> Mill Card (Delve), Flashback Card <-> Mill Card (Graveyard Spells)
	assert.Len(t, resp.Edges, 2)

	labels := map[string]bool{}
	for _, e := range resp.Edges {
		for _, l := range e.RuleLabels {
			labels[l] = true
		}
	}
	assert.True(t, labels["Delve"])
	assert.True(t, labels["Graveyard Spells"])
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
