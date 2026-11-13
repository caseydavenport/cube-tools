package stats

import (
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// matchCards returns the names of the cards meeting a rule condition.
func matchCards(cards map[string]types.Card, cond string) map[string]bool {
	return matchQuery(cards, rulebook.Condition(cond))
}

// matchQuery returns the names of the cards a compiled query matches.
func matchQuery(cards map[string]types.Card, q *search.Query) map[string]bool {
	result := make(map[string]bool)
	for name, card := range cards {
		if rulebook.ConditionMatches(q, search.Prepare(card, nil)) {
			result[name] = true
		}
	}
	return result
}
