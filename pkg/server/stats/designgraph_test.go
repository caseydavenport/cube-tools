package stats

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

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
