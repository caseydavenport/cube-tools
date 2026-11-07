package stats

import (
	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ruleCondition compiles a rule group condition. A condition that doesn't
// parse is logged and comes back nil, which matches no card, so one bad rule
// can't pull every card into its group.
func ruleCondition(cond string) *search.Query {
	q, err := search.Compile(cond, search.TargetRules)
	if err != nil {
		logrus.WithError(err).WithField("condition", cond).Warn("rule condition doesn't parse")
		return nil
	}
	return q
}

// conditionMatches reports whether a card, readied by search.Prepare, meets a
// compiled rule condition; nil, a condition that didn't parse, matches
// nothing.
func conditionMatches(q *search.Query, card search.Card) bool {
	return q != nil && q.MatchPrepared(card)
}

// matchCards returns the names of the cards meeting a rule condition.
func matchCards(cards map[string]types.Card, cond string) map[string]bool {
	return matchQuery(cards, ruleCondition(cond))
}

// matchQuery returns the names of the cards a compiled query matches.
func matchQuery(cards map[string]types.Card, q *search.Query) map[string]bool {
	result := make(map[string]bool)
	for name, card := range cards {
		if conditionMatches(q, search.Prepare(card, nil)) {
			result[name] = true
		}
	}
	return result
}
