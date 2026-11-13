package rulebook

import (
	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/search"
)

// Condition compiles a rule group condition. A condition that doesn't
// parse is logged and comes back nil, which matches no card, so one bad rule
// can't pull every card into its group.
func Condition(cond string) *search.Query {
	q, err := search.Compile(cond, search.TargetRules)
	if err != nil {
		logrus.WithError(err).WithField("condition", cond).Warn("rule condition doesn't parse")
		return nil
	}
	return q
}

// ConditionMatches reports whether a card, readied by search.Prepare, meets a
// compiled rule condition; nil, a condition that didn't parse, matches
// nothing.
func ConditionMatches(q *search.Query, card search.Card) bool {
	return q != nil && q.MatchPrepared(card)
}
