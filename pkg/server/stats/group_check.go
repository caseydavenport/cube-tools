package stats

import (
	"encoding/json"
	"net/http"
	"slices"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// GroupCheck says whether a card is in a group and why: each of the group's
// conditions, with its parts marked passed or failed. Excluded is true when
// the group's exclude list names the card.
type GroupCheck struct {
	Card       string           `json:"card"`
	InGroup    bool             `json:"in_group"`
	Excluded   bool             `json:"excluded"`
	Conditions []ConditionCheck `json:"conditions"`
}

// ConditionCheck is one group condition checked against a card. Parts are
// the condition's top-level AND parts; a condition that is one term, or one
// OR of terms, has a single part.
type ConditionCheck struct {
	Condition string          `json:"condition"`
	Matched   bool            `json:"matched"`
	Parts     []ConditionPart `json:"parts"`

	// Error says why the condition doesn't parse; such a condition matches
	// no card.
	Error string `json:"error,omitempty"`
}

// ConditionPart is one part of a condition and whether the card passed it.
type ConditionPart struct {
	Text    string `json:"text"`
	Matched bool   `json:"matched"`
}

// GroupCheckRequest is the body of a group check: the group as it stands,
// saved or not, and the card to check.
type GroupCheckRequest struct {
	Group design.Group `json:"group"`
	Card  string       `json:"card"`
}

// explainCondition checks a card against one condition, part by part.
func explainCondition(card types.Card, condition string) ConditionCheck {
	q, err := search.Compile(condition, search.TargetRules)
	if err != nil {
		return ConditionCheck{Condition: condition, Error: err.Error(), Parts: []ConditionPart{}}
	}

	check := ConditionCheck{Condition: condition, Matched: q.MatchCard(card), Parts: []ConditionPart{}}
	for _, part := range q.Parts() {
		check.Parts = append(check.Parts, ConditionPart{Text: part.String(), Matched: part.MatchCard(card)})
	}
	return check
}

// checkGroup checks a card against every condition of a group. The card is
// in the group when any condition matches and the exclude list doesn't name
// it.
func checkGroup(card types.Card, group design.Group) GroupCheck {
	check := GroupCheck{Card: card.Name, Conditions: []ConditionCheck{}}
	matched := false
	for _, condition := range group.Conditions {
		c := explainCondition(card, condition)
		matched = matched || c.Matched
		check.Conditions = append(check.Conditions, c)
	}
	check.Excluded = matched && slices.Contains(group.Exclude, card.Name)
	check.InGroup = matched && !check.Excluded
	return check
}

// GroupCheckHandler serves POST /api/{cube}/stats/group-check: why a card is
// or isn't in a group. The group comes in the body, so the editor can check
// a group it hasn't saved yet.
func GroupCheckHandler(src types.CubeSource) http.Handler {
	return &groupCheckHandler{src: src}
}

type groupCheckHandler struct {
	src types.CubeSource
}

// ServeHTTP answers one group check: 400 for a bad body, 404 for a card
// neither the cube nor the oracle data knows.
func (h *groupCheckHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	var req GroupCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(rw, "could not read the request", http.StatusBadRequest)
		return
	}
	cube, err := h.src.Current(server.CubeFromRequest(r))
	if err != nil {
		logrus.WithError(err).Error("could not load the cube for a group check")
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}
	card, _, ok := lookupCard(cube, req.Card)
	if !ok {
		http.Error(rw, "unknown card", http.StatusNotFound)
		return
	}
	writeJSON(rw, checkGroup(card, req.Group), "group check")
}
