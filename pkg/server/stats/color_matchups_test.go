package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// makePipDeck builds a deck with explicit colors and n creature spells per mana
// cost, so PrimaryColorPair has pips to rank.
func makePipDeck(colors []string, spells map[string]int) *storage.Deck {
	d := &storage.Deck{}
	d.Colors = colors
	for cost, n := range spells {
		for range n {
			d.Mainboard = append(d.Mainboard, types.Card{ManaCost: cost, Types: []string{"Creature"}})
		}
	}
	return d
}

type colorGroupsCase struct {
	name      string
	deck      *storage.Deck
	groupSize int
	want      []string
}

// Primary mode only produces pairs, so it returns groups for the Any (0) and
// Dual (2) sizes and nothing for Mono or Trio.
func TestColorGroups_PrimaryOnlyReturnsPairs(t *testing.T) {
	dual := makePipDeck([]string{"W", "U"}, map[string]int{
		"{W}": 10,
		"{U}": 10,
	})
	splash := makePipDeck([]string{"W", "U", "R"}, map[string]int{
		"{W}": 10,
		"{U}": 10,
		"{R}": 2,
	})
	mono := makePipDeck([]string{"W"}, map[string]int{"{W}": 10})

	tests := []colorGroupsCase{
		{"dual deck, any size", dual, 0, []string{"WU"}},
		{"dual deck, mono size", dual, 1, nil},
		{"dual deck, dual size", dual, 2, []string{"WU"}},
		{"dual deck, trio size", dual, 3, nil},
		{"splash deck, any size", splash, 0, []string{"WU"}},
		{"splash deck, dual size", splash, 2, []string{"WU"}},
		{"splash deck, trio size", splash, 3, nil},
		{"mono deck, any size", mono, 0, nil},
		{"mono deck, mono size", mono, 1, nil},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, colorGroups(tc.deck, ColorModePrimary, tc.groupSize))
		})
	}
}

// A deck with no decklist and no recorded colors has unknown colors, so it
// joins no group in any mode, even for the Any (0) size.
func TestColorGroups_UnknownColorsJoinNoGroup(t *testing.T) {
	unknown := makePipDeck(nil, nil)
	for _, mode := range []colorMode{ColorModeExact, ColorModeInclusive, ColorModePrimary} {
		t.Run(string(mode), func(t *testing.T) {
			assert.Empty(t, colorGroups(unknown, mode, 0))
		})
	}
}

func TestMatchupRecord_SignificantOnlyWhenIntervalExcludesHalf(t *testing.T) {
	lopsided := &MatchupRecord{Wins: 40, Losses: 10}
	lopsided.finish(60, zForConfidence(0.95))
	assert.True(t, lopsided.Significant)
	assert.Greater(t, lopsided.WinPctLow, 50.0)

	nearEven := &MatchupRecord{Wins: 6, Losses: 4}
	nearEven.finish(60, zForConfidence(0.95))
	assert.False(t, nearEven.Significant)
	assert.Equal(t, 60.0, nearEven.WinPct)

	empty := &MatchupRecord{}
	empty.finish(60, zForConfidence(0.95))
	assert.False(t, empty.Significant)
}
