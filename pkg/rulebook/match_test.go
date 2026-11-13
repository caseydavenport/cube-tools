package rulebook

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestMatch_ReportsEveryConditionInOrder(t *testing.T) {
	bolt := types.Card{Name: "Lightning Bolt", Types: []string{"Instant"}, CMC: 1}
	groups := []design.Group{
		{Name: "Cheap spells", Conditions: []string{"t:creature", "cmc<2", "t:instant"}},
		{Name: "Creatures", Conditions: []string{"t:creature"}},
	}

	got := NewMatcher(groups).Match(bolt)

	require.Len(t, got, 1, "a group with no matching condition is left out")
	assert.Equal(t, "Cheap spells", got[0].Group.Name)
	assert.Equal(t, []int{1, 2}, got[0].Conditions)
	assert.False(t, got[0].Excluded)
}

func TestMatch_ExcludeListRemovesTheCard(t *testing.T) {
	groups := []design.Group{{Name: "Instants", Conditions: []string{"t:instant"}, Exclude: []string{"Lightning Bolt"}}}

	matcher := NewDraftMatcher(groups)
	excluded := matcher.Match(types.Card{Name: "Lightning Bolt", Types: []string{"Instant"}})
	kept := matcher.Match(types.Card{Name: "Shock", Types: []string{"Instant"}})

	require.Len(t, excluded, 1, "an excluded match is still reported, so the editor can show it")
	assert.True(t, excluded[0].Excluded)
	require.Len(t, kept, 1)
	assert.False(t, kept[0].Excluded)
}

func TestMatch_UnparseableConditionMatchesNothing(t *testing.T) {
	groups := []design.Group{{Name: "Broken", Conditions: []string{"t:(creature"}}}
	assert.Empty(t, NewMatcher(groups).Match(types.Card{Name: "Grizzly Bears", Types: []string{"Creature"}}))
}

func TestMatchGroups_ExcludedListedSeparately(t *testing.T) {
	cards := map[string]types.Card{
		"Bear": {Name: "Bear", Types: []string{"Creature"}},
		"Elk":  {Name: "Elk", Types: []string{"Creature"}},
	}
	groups := []design.Group{{Name: "Creatures", Conditions: []string{"t:creature"}, Exclude: []string{"Elk", "Not In Cube"}}}

	members, excluded := matchGroups(cards, groups)

	assert.Equal(t, cardSet("Bear"), members["Creatures"])
	assert.Equal(t, []string{"Elk"}, excluded["Creatures"], "only cards a condition matched are listed as excluded")
}

func TestDraftMatcher_LeavesSharedMemoryAlone(t *testing.T) {
	groups := []design.Group{{Name: "Draft only", Conditions: []string{"t:sorcery cmc=7"}}}
	key := conditionsKey(groups)

	NewDraftMatcher(groups).Match(types.Card{Name: "Bear", Types: []string{"Creature"}})
	groupMatches.mu.Lock()
	_, kept := groupMatches.sets[key]
	groupMatches.mu.Unlock()
	assert.False(t, kept, "a draft's matches are not remembered")

	NewMatcher(groups).Match(types.Card{Name: "Bear", Types: []string{"Creature"}})
	groupMatches.mu.Lock()
	_, kept = groupMatches.sets[key]
	groupMatches.mu.Unlock()
	assert.True(t, kept, "saved rules' matches are")
}

func TestEntries_GroupsAndCardEntriesForAnOutsideCard(t *testing.T) {
	config := design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Instants", Conditions: []string{"t:instant"}},
			{Name: "Burn", Conditions: []string{"o:damage"}, Exclude: []string{"Lightning Bolt"}},
		},
		Packages: []design.Package{{Name: "Spells", Wires: []design.Wire{{Sources: []string{"Instants"}, Targets: []string{"card:Lightning Bolt"}}}}},
	}
	rb := load(t, namedCards("Grizzly Bears"), config)
	bolt := types.Card{Name: "Lightning Bolt", Types: []string{"Instant"}, OracleText: "deals 3 damage"}

	assert.Equal(t, []string{"Instants", "card:Lightning Bolt"}, rb.Entries(bolt), "Burn's exclude list keeps Bolt out")
}

func TestBasicGroups_MatchBasicLands(t *testing.T) {
	config := design.DesignMapConfig{Groups: []design.Group{
		{Name: "Forests", Conditions: []string{"t:forest"}},
		{Name: "Creatures", Conditions: []string{"t:creature"}},
	}}
	rb := load(t, namedCards("Grizzly Bears"), config)

	basics := rb.BasicGroups()
	assert.Equal(t, cardSet("Forest", "Snow-Covered Forest"), basics["Forests"])
	assert.Empty(t, basics["Creatures"])
}
