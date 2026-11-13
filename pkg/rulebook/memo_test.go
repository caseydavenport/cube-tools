package rulebook

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestGroupMemo_MatchesEachCardOnce(t *testing.T) {
	memo := newGroupMemo(4)
	groups := []design.Group{{Name: "Creatures", Conditions: []string{"t:creature"}}}
	cards := namedCards("Freddie", "Ozzy").Cards

	for range 3 {
		for _, c := range cards {
			assert.Equal(t, []int{0}, memo.forGroups(groups).matched(c))
		}
	}
	assert.Equal(t, 2, memo.forGroups(groups).evaluated, "each card is matched once")
}

func TestGroupMemo_NewRulesMatchAgain(t *testing.T) {
	memo := newGroupMemo(4)
	card := types.Card{Name: "Freddie", Types: []string{"Creature"}}
	creatures := []design.Group{{Name: "G", Conditions: []string{"t:creature"}}}
	instants := []design.Group{{Name: "G", Conditions: []string{"t:instant"}}}

	assert.Equal(t, []int{0}, memo.forGroups(creatures).matched(card))
	assert.Empty(t, memo.forGroups(instants).matched(card), "an edited condition is matched afresh")
}

func TestGroupMemo_ChangedCardMatchesAgain(t *testing.T) {
	memo := newGroupMemo(4)
	groups := []design.Group{{Name: "Creatures", Conditions: []string{"t:creature"}}}
	before := types.Card{Name: "Freddie", Types: []string{"Creature"}}
	after := types.Card{Name: "Freddie", Types: []string{"Instant"}}

	assert.Equal(t, []int{0}, memo.forGroups(groups).matched(before))
	assert.Empty(t, memo.forGroups(groups).matched(after), "a card whose data changed is matched afresh")
}

func TestGroupMemo_KeepsLimitedRuleSets(t *testing.T) {
	memo := newGroupMemo(2)
	for _, cond := range []string{"t:a", "t:b", "t:c"} {
		memo.forGroups([]design.Group{{Name: "G", Conditions: []string{cond}}})
	}
	assert.Len(t, memo.sets, 2, "the oldest rule set is dropped")
}
