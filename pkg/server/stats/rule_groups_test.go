package stats

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// redsRules is sacrificeRules plus a Reds group whose first condition also
// catches Mayhem Devil and whose last matches nothing, and a package wired to
// a group the rules don't define.
func redsRules() design.DesignMapConfig {
	config := sacrificeRules("Sacrifice")
	config.Groups = append(config.Groups, design.Group{
		Name:       "Reds",
		Conditions: []string{"c:R t:creature", `n:"Mayhem Devil"`, `n:"Nonexistent Card Xyz"`},
	})
	config.Packages = append(config.Packages, design.Package{
		Name:  "Odd",
		Wires: []design.Wire{{Sources: []string{"Reds"}, Targets: []string{"Ghost"}}},
	})
	return config
}

// rangedRulesStore is a rulesDeckStorage that honors a request's date range,
// for tests of handlers that follow it.
type rangedRulesStore struct {
	rulesDeckStorage
}

// List returns the decks dated within the request's range; an empty end of
// the range is open.
func (s *rangedRulesStore) List(_ string, req *storage.DecksRequest) ([]*storage.Deck, error) {
	var out []*storage.Deck
	for _, d := range s.decks {
		if req != nil && req.Start != "" && d.Date < req.Start {
			continue
		}
		if req != nil && req.End != "" && d.Date > req.End {
			continue
		}
		out = append(out, d)
	}
	return out, nil
}

// ruleGroupsFor serves the rule groups for params over config and decodes
// them on success.
func ruleGroupsFor(t *testing.T, config design.DesignMapConfig, params url.Values) (int, RuleGroupsResponse) {
	t.Helper()
	store := &rulesDeckStorage{config: config}
	rr := serveCube(RuleGroupsHandler(store, testCubeSource{}), "/api/polyverse/stats/rule-groups", params)
	var resp RuleGroupsResponse
	if rr.Code == http.StatusOK {
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	}
	return rr.Code, resp
}

// conditionCards names the cards listed under each condition.
func conditionCards(g GroupMembers) map[string][]string {
	out := map[string][]string{}
	for _, c := range g.Conditions {
		out[c.Condition] = []string{}
		for _, card := range c.Cards {
			out[c.Condition] = append(out[c.Condition], card.Name)
		}
	}
	return out
}

func TestRuleGroups_Package(t *testing.T) {
	code, resp := ruleGroupsFor(t, redsRules(), url.Values{"package": {"sacrifice"}})
	require.Equal(t, http.StatusOK, code)
	require.Len(t, resp.Groups, 3)
	assert.Equal(t, "Outlets", resp.Groups[0].Name)
	assert.Equal(t, "Fodder", resp.Groups[2].Name)

	payoffs := resp.Groups[1]
	assert.Equal(t, "Payoffs", payoffs.Name)
	require.Len(t, payoffs.Conditions, 1)
	require.Len(t, payoffs.Conditions[0].Cards, 1)
	devil := payoffs.Conditions[0].Cards[0]
	assert.Equal(t, "Mayhem Devil", devil.Name)
	assert.Equal(t, []string{`n:"Mayhem Devil"`}, devil.Matched)
	assert.Equal(t, []WireUse{{Package: "Sacrifice", Wire: 0, Side: "targets"}}, payoffs.Uses)
}

func TestRuleGroups_FirstConditionWins(t *testing.T) {
	_, resp := ruleGroupsFor(t, redsRules(), url.Values{"group": {"Reds"}})
	require.Len(t, resp.Groups, 1)
	cards := conditionCards(resp.Groups[0])
	assert.Contains(t, cards["c:R t:creature"], "Mayhem Devil")
	assert.Empty(t, cards[`n:"Mayhem Devil"`])

	for _, card := range resp.Groups[0].Conditions[0].Cards {
		if card.Name == "Mayhem Devil" {
			assert.Equal(t, []string{"c:R t:creature", `n:"Mayhem Devil"`}, card.Matched)
		}
	}
}

func TestRuleGroups_EmptyCondition(t *testing.T) {
	_, resp := ruleGroupsFor(t, redsRules(), url.Values{"group": {"Reds"}})
	require.Len(t, resp.Groups[0].Conditions, 3)
	last := resp.Groups[0].Conditions[2]
	assert.Equal(t, `n:"Nonexistent Card Xyz"`, last.Condition)
	assert.Equal(t, []MemberCard{}, last.Cards)
}

func TestRuleGroups_CardEntry(t *testing.T) {
	_, resp := ruleGroupsFor(t, redsRules(), url.Values{"package": {"Burn"}})
	require.Len(t, resp.Groups, 2)
	entry := resp.Groups[1]
	assert.Equal(t, "card:Lightning Bolt", entry.Name)
	assert.True(t, entry.CardEntry)
	assert.Equal(t, map[string][]string{"": {"Lightning Bolt"}}, conditionCards(entry))
}

func TestRuleGroups_MissingGroup(t *testing.T) {
	_, resp := ruleGroupsFor(t, redsRules(), url.Values{"package": {"Odd"}})
	require.Len(t, resp.Groups, 2)
	ghost := resp.Groups[1]
	assert.Equal(t, GroupMembers{
		Name:       "Ghost",
		Missing:    true,
		Conditions: []ConditionMembers{},
		Excluded:   []MemberCard{},
		Uses:       []WireUse{{Package: "Odd", Wire: 0, Side: "targets"}},
	}, ghost)
}

func TestRuleGroups_Excluded(t *testing.T) {
	config := redsRules()
	config.Groups[3].Exclude = []string{"Grim Lavamancer"}

	_, resp := ruleGroupsFor(t, config, url.Values{"group": {"Reds"}})
	reds := resp.Groups[0]
	require.Len(t, reds.Excluded, 1)
	assert.Equal(t, "Grim Lavamancer", reds.Excluded[0].Name)
	for _, names := range conditionCards(reds) {
		assert.NotContains(t, names, "Grim Lavamancer")
	}
}

func TestRuleGroups_BadRequests(t *testing.T) {
	code, _ := ruleGroupsFor(t, redsRules(), url.Values{})
	assert.Equal(t, http.StatusBadRequest, code)

	code, _ = ruleGroupsFor(t, redsRules(), url.Values{"group": {"Nope"}})
	assert.Equal(t, http.StatusNotFound, code)

	code, _ = ruleGroupsFor(t, redsRules(), url.Values{"package": {"Nope"}})
	assert.Equal(t, http.StatusNotFound, code)
}

func TestRuleGroups_MemberDecks(t *testing.T) {
	store := &rangedRulesStore{rulesDeckStorage{mockDeckStorage: mockDeckStorage{decks: sacrificeDecks()}, config: redsRules()}}
	decksOf := func(params url.Values) int {
		rr := serveCube(RuleGroupsHandler(store, testCubeSource{}), "/api/polyverse/stats/rule-groups", params)
		require.Equal(t, http.StatusOK, rr.Code)
		var resp RuleGroupsResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		return resp.Groups[0].Conditions[0].Cards[0].Decks
	}
	assert.Equal(t, 2, decksOf(url.Values{"group": {"Outlets"}}))
	assert.Equal(t, 1, decksOf(url.Values{"group": {"Outlets"}, "end": {"2024-01-15"}}))
}
