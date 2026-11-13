package rulebook

import (
	"slices"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// compileCondition compiles a rule group condition. A condition that doesn't
// parse is logged and comes back nil, which matches no card, so one bad rule
// can't pull every card into its group.
func compileCondition(cond string) *search.Query {
	q, err := search.Compile(cond, search.TargetRules)
	if err != nil {
		logrus.WithError(err).WithField("condition", cond).Warn("rule condition doesn't parse")
		return nil
	}
	return q
}

// GroupMatch is how one group judges a card: the indexes of the group's
// conditions the card meets, in order, and whether the group's exclude list
// removes the card anyway.
type GroupMatch struct {
	Group      design.Group
	Conditions []int
	Excluded   bool
}

// Matcher decides which groups each card is in. A card is in a group when one
// of the group's conditions matches it and the group's exclude list doesn't
// name it; every page that asks about membership goes through here.
type Matcher struct {
	groups []design.Group
	rules  *ruleMatches
}

// NewMatcher matches cards against saved rules, remembering each card's
// matches across requests until the rules' conditions change.
func NewMatcher(groups []design.Group) Matcher {
	return Matcher{groups: groups, rules: groupMatches.forGroups(groups)}
}

// NewDraftMatcher matches cards against groups being edited. It remembers
// nothing past the request, so typing in the editor doesn't push the saved
// rules out of the shared memory.
func NewDraftMatcher(groups []design.Group) Matcher {
	return Matcher{groups: groups, rules: newRuleMatches(groups)}
}

// Match returns each group the card meets a condition of, in the groups'
// order, with excluded ones included so callers can show them.
func (m Matcher) Match(card types.Card) []GroupMatch {
	var out []GroupMatch
	for _, hit := range m.rules.matched(card) {
		g := m.groups[hit.group]
		out = append(out, GroupMatch{Group: g, Conditions: hit.conditions, Excluded: slices.Contains(g.Exclude, card.Name)})
	}
	return out
}
