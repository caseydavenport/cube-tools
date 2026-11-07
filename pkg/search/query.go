// Package search is cube-tools' search language, modeled on Scryfall's
// syntax. Keyword terms test a card or a deck, and extra keywords cover
// decks, drafts and play stats.
package search

import (
	"fmt"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Target is what a query searches, which decides the keywords it accepts.
type Target string

const (
	// TargetRules is a rule group condition: card keywords only.
	TargetRules Target = "rules"

	// TargetCards is the Cards page search: card and play-stat keywords.
	TargetCards Target = "cards"

	// TargetDecks is a deck search: card and deck keywords.
	TargetDecks Target = "decks"
)

// allows reports whether the target accepts a keyword of the scope.
func (t Target) allows(scope Scope) bool {
	switch scope {
	case ScopeStat:
		return t == TargetCards
	case ScopeDeck:
		return t == TargetDecks
	}
	return true
}

// refusal says why the target refuses a keyword of the scope.
func (t Target) refusal(scope Scope) string {
	if scope == ScopeStat {
		return "only works on the Cards page"
	}
	return "only works in a deck search"
}

// ParseTarget reads a target name, as the check endpoint takes it.
func ParseTarget(name string) (Target, error) {
	switch t := Target(name); t {
	case TargetRules, TargetCards, TargetDecks:
		return t, nil
	}
	return "", fmt.Errorf("unknown search target %q", name)
}

// Card is what a card query judges: a card and, on the Cards page, its play
// stats.
type Card struct {
	types.Card

	// Stats are the card's play stats, nil outside the Cards page.
	Stats *CardStats
}

// CardStats are the play stats the Cards page's search keywords read.
type CardStats struct {
	Games      int
	Mainboard  int
	Sideboard  int
	Players    int
	Drafts     int
	WinPct     float64
	Popularity string
}

// Query is a compiled search. The zero Query and a blank search match
// everything.
type Query struct {
	root   node
	target Target
}

// Compile parses q for the target. The error names what's wrong in words a
// person typing the search can act on.
func Compile(q string, target Target) (*Query, error) {
	root, err := parse(q, target)
	if err != nil {
		return nil, err
	}
	return &Query{root: root, target: target}, nil
}

// MustCompile is Compile for a query known to be valid, such as one in a
// test. It panics on an error.
func MustCompile(q string, target Target) *Query {
	compiled, err := Compile(q, target)
	if err != nil {
		panic(err)
	}
	return compiled
}

// Empty reports whether the query has no terms, so it matches everything.
func (q *Query) Empty() bool {
	return q == nil || q.root == nil
}

// MatchCard reports whether a card matches.
func (q *Query) MatchCard(c types.Card) bool {
	return q.MatchCardStats(Card{Card: c})
}

// MatchCardStats reports whether a card with its play stats matches.
func (q *Query) MatchCardStats(c Card) bool {
	if q.Empty() {
		return true
	}
	return q.root.matchCard(c)
}

// Parts splits the query into its top-level ANDed clauses, so a rule check
// can say which clause a card passed or failed.
func (q *Query) Parts() []Part {
	if q.Empty() {
		return nil
	}
	nodes := []node{q.root}
	if and, ok := q.root.(*andNode); ok {
		nodes = and.children
	}
	parts := make([]Part, 0, len(nodes))
	for _, n := range nodes {
		parts = append(parts, Part{root: n})
	}
	return parts
}

// Part is one top-level clause of a query.
type Part struct {
	root node
}

// String is the clause's query text.
func (p Part) String() string {
	return p.root.String()
}

// MatchCard reports whether a card meets the clause.
func (p Part) MatchCard(c types.Card) bool {
	return p.root.matchCard(Card{Card: c})
}

// String rebuilds the query text in canonical form.
func (q *Query) String() string {
	if q.Empty() {
		return ""
	}
	return q.root.String()
}
