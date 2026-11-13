package stats

import (
	"maps"
	"net/http"
	"slices"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// RuleGroupsResponse lists groups with their cube members, for the Rules
// editor's package workspace and group view.
type RuleGroupsResponse struct {
	Groups []GroupMembers `json:"groups"`
}

// GroupMembers is one rule entry's members, listed under the first condition
// each card matched. A card entry holds its card under one empty condition; a
// missing group, one a wire names but the rules don't define, holds nothing.
// Excluded lists the matches the exclude list removed, and Uses every wire
// naming the entry.
type GroupMembers struct {
	Name       string             `json:"name"`
	CardEntry  bool               `json:"card_entry"`
	Missing    bool               `json:"missing"`
	Conditions []ConditionMembers `json:"conditions"`
	Excluded   []MemberCard       `json:"excluded"`
	Uses       []WireUse          `json:"uses"`
}

// ConditionMembers is one condition and the cards whose first match it is,
// sorted by name. A condition that matches nothing is still listed.
type ConditionMembers struct {
	Condition string       `json:"condition"`
	Cards     []MemberCard `json:"cards"`
}

// MemberCard is a card as a group lists it: its colors and whether it's a
// land, for the color dots, every condition of the group it matched, and how
// many decks in the date range played it.
type MemberCard struct {
	Name    string   `json:"name"`
	Colors  []string `json:"colors"`
	Land    bool     `json:"land"`
	Matched []string `json:"matched"`
	Decks   int      `json:"decks"`
}

// RuleGroupsHandler serves GET /api/{cube}/stats/rule-groups, for every entry
// of the package named by "package" or for the one group named by "group".
// Members are cube cards only; their play counts follow the date range.
func RuleGroupsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &ruleGroupsHandler{store: store, src: src, q: deckquery.New(store, src)}
}

type ruleGroupsHandler struct {
	store storage.DeckStorage
	src   types.CubeSource
	q     *deckquery.Query
}

// ServeHTTP answers one request: 400 with neither parameter, 404 for a
// package or group the rules don't have.
func (h *ruleGroupsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	pkgName := query.GetString(r, "package")
	groupName := query.GetString(r, "group")
	if pkgName == "" && groupName == "" {
		http.Error(rw, "name a package or a group", http.StatusBadRequest)
		return
	}
	cubeID := server.CubeFromRequest(r)
	rules, err := loadDesignInputs(h.store, h.src, cubeID)
	if err != nil {
		logrus.WithError(err).Error("could not load the rules for rule groups")
		http.Error(rw, "could not load rules", http.StatusInternalServerError)
		return
	}
	decks, err := h.q.Decks(cubeID, &storage.DecksRequest{Start: query.GetString(r, "start"), End: query.GetString(r, "end")})
	if err != nil {
		logrus.WithError(err).Error("could not load decks for rule groups")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}
	cardMap := rulebook.CardMap(rules.cube)
	played := playCounts(decks)

	// One group by name.
	if pkgName == "" {
		if !slices.ContainsFunc(rules.config.Groups, func(g design.Group) bool { return g.Name == groupName }) {
			http.Error(rw, "unknown group", http.StatusNotFound)
			return
		}
		resp := RuleGroupsResponse{Groups: []GroupMembers{groupMembers(groupName, rules.config, cardMap, played)}}
		writeJSON(rw, resp, "rule groups")
		return
	}

	// Every entry of a package, in wire order.
	idx := slices.IndexFunc(rules.config.Packages, func(p design.Package) bool { return strings.EqualFold(p.Name, pkgName) })
	if idx < 0 {
		http.Error(rw, "unknown package", http.StatusNotFound)
		return
	}
	resp := RuleGroupsResponse{Groups: []GroupMembers{}}
	for _, entry := range wireEntries(rules.config.Packages[idx]) {
		resp.Groups = append(resp.Groups, groupMembers(entry, rules.config, cardMap, played))
	}
	writeJSON(rw, resp, "rule groups")
}

// groupMembers lists an entry's cube members by first matched condition. A
// card is in the group when some condition matches and the exclude list
// doesn't name it, as resolveGroupCards decides. played counts each card's
// decks.
func groupMembers(entry string, config design.DesignMapConfig, cardMap map[string]types.Card, played map[string]int) GroupMembers {
	out := GroupMembers{
		Name:       entry,
		Conditions: []ConditionMembers{},
		Excluded:   []MemberCard{},
		Uses:       wireUses(entry, config),
	}

	// A card entry holds just its card, when the cube has it.
	if name := design.CardRefName(entry); name != "" {
		out.CardEntry = true
		cond := ConditionMembers{Condition: "", Cards: []MemberCard{}}
		if card, ok := cardMap[name]; ok {
			cond.Cards = append(cond.Cards, memberCard(card, []string{}, played))
		}
		out.Conditions = append(out.Conditions, cond)
		return out
	}

	idx := slices.IndexFunc(config.Groups, func(g design.Group) bool { return g.Name == entry })
	if idx < 0 {
		out.Missing = true
		return out
	}
	group := config.Groups[idx]

	// Parse each condition once.
	exprs := make([]*search.Query, len(group.Conditions))
	for i, cond := range group.Conditions {
		exprs[i] = rulebook.Condition(cond)
		out.Conditions = append(out.Conditions, ConditionMembers{Condition: cond, Cards: []MemberCard{}})
	}

	// File each matching card under its first condition, or as excluded.
	for _, name := range slices.Sorted(maps.Keys(cardMap)) {
		card := cardMap[name]
		prepared := search.Prepare(card, nil)
		first := -1
		matched := []string{}
		for i, expr := range exprs {
			if rulebook.ConditionMatches(expr, prepared) {
				if first < 0 {
					first = i
				}
				matched = append(matched, group.Conditions[i])
			}
		}
		if first < 0 {
			continue
		}
		member := memberCard(card, matched, played)
		if slices.Contains(group.Exclude, name) {
			out.Excluded = append(out.Excluded, member)
			continue
		}
		out.Conditions[first].Cards = append(out.Conditions[first].Cards, member)
	}
	return out
}

// memberCard is how a group lists card, with the conditions it matched and
// its play count from played.
func memberCard(card types.Card, matched []string, played map[string]int) MemberCard {
	colors := card.Colors
	if colors == nil {
		colors = []string{}
	}
	return MemberCard{Name: card.Name, Colors: colors, Land: card.IsLand(), Matched: matched, Decks: played[card.Name]}
}

// playCounts counts, for each card, the decks whose non-basic mainboard plays
// it.
func playCounts(decks []*storage.Deck) map[string]int {
	numDecks := map[string]int{}
	for _, d := range decks {
		for _, name := range nonBasicMainboard(d) {
			numDecks[name]++
		}
	}
	return numDecks
}
