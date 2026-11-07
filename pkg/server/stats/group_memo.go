package stats

import (
	"crypto/sha256"
	"fmt"
	"slices"
	"strings"
	"sync"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// groupMemoRuleSets is how many rule sets the memo keeps: the saved rules and
// the build-around shape, plus room for previews of proposed edits.
const groupMemoRuleSets = 6

// groupMatches remembers which groups each card matches, so the many
// requests that resolve the same rules against the same cards skip the
// condition matching, the slowest part of resolving packages.
var groupMatches = newGroupMemo(groupMemoRuleSets)

// groupMemo holds the matches for the last few rule sets it was asked about,
// keyed by the groups' conditions. An edit to the rules starts a new set; the
// oldest set is dropped once there are more than limit.
type groupMemo struct {
	mu    sync.Mutex
	limit int
	order []string
	sets  map[string]*ruleMatches
}

func newGroupMemo(limit int) *groupMemo {
	return &groupMemo{limit: limit, sets: map[string]*ruleMatches{}}
}

// forGroups returns the matches for this list of groups, starting a new set
// when their conditions are ones the memo hasn't seen.
func (m *groupMemo) forGroups(groups []design.Group) *ruleMatches {
	key := conditionsKey(groups)
	m.mu.Lock()
	defer m.mu.Unlock()
	if rm, ok := m.sets[key]; ok {
		return rm
	}
	rm := newRuleMatches(groups)
	m.sets[key] = rm
	m.order = append(m.order, key)
	if len(m.order) > m.limit {
		delete(m.sets, m.order[0])
		m.order = m.order[1:]
	}
	return rm
}

// conditionsKey joins each group's conditions in order. Matching depends only
// on these, not on group names or exclusions.
func conditionsKey(groups []design.Group) string {
	var b strings.Builder
	for _, g := range groups {
		b.WriteString(strings.Join(g.Conditions, "\x1f"))
		b.WriteByte('\x1e')
	}
	return b.String()
}

// ruleMatches is one rule set's parsed conditions and, per card, the indexes
// of the groups it matches. Cards are keyed by their full contents, so a card
// whose data changes is matched again.
type ruleMatches struct {
	exprs [][]*search.Query

	mu        sync.Mutex
	byCard    map[[sha256.Size]byte][]int
	evaluated int
}

func newRuleMatches(groups []design.Group) *ruleMatches {
	rm := &ruleMatches{byCard: map[[sha256.Size]byte][]int{}}
	for _, g := range groups {
		var exprs []*search.Query
		for _, cond := range g.Conditions {
			exprs = append(exprs, ruleCondition(cond))
		}
		rm.exprs = append(rm.exprs, exprs)
	}
	return rm
}

// matched returns the indexes of the groups the card matches, in order.
func (rm *ruleMatches) matched(card types.Card) []int {
	key := cardKey(card)
	rm.mu.Lock()
	out, ok := rm.byCard[key]
	rm.mu.Unlock()
	if ok {
		return out
	}

	out = []int{}
	prepared := search.Prepare(card, nil)
	for i, exprs := range rm.exprs {
		if slices.ContainsFunc(exprs, func(e *search.Query) bool { return conditionMatches(e, prepared) }) {
			out = append(out, i)
		}
	}
	rm.mu.Lock()
	rm.byCard[key] = out
	rm.evaluated++
	rm.mu.Unlock()
	return out
}

// cardKey identifies a card by a hash of everything a condition can test,
// faces and oracle tags included, which JSON leaves out.
func cardKey(card types.Card) [sha256.Size]byte {
	return sha256.Sum256([]byte(fmt.Sprintf("%#v", card)))
}
