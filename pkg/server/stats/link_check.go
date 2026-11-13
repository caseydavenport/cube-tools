package stats

import (
	"cmp"
	"net/http"
	"slices"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// LinkCheckResponse says whether the rules link two cards. Links lists every
// wire that does, with card A's entry first; A and B list each card's groups
// and where the rules use them, so the editor can offer ways to link them.
type LinkCheckResponse struct {
	A     LinkCard     `json:"a"`
	B     LinkCard     `json:"b"`
	Links []LinkThread `json:"links"`
}

// LinkCard is one card of a link check and the groups it belongs to.
type LinkCard struct {
	Name   string      `json:"name"`
	Groups []GroupUses `json:"groups"`
}

// GroupUses is a group and every wire that names it.
type GroupUses struct {
	Group string    `json:"group"`
	Uses  []WireUse `json:"uses"`
}

// WireUse is one place a group appears: a package, the wire's index in it,
// and the rules-file side key, "sources" or "targets". The side matters only
// for editing; the two sides mean the same thing.
type WireUse struct {
	Package string `json:"package"`
	Wire    int    `json:"wire"`
	Side    string `json:"side"`
}

// LinkThread is one wire linking the two cards: card A's entry on one side,
// card B's on the other. MatchedA and MatchedB are the first condition each
// card matched, "" for a card: entry.
type LinkThread struct {
	Package  string `json:"package"`
	Wire     int    `json:"wire"`
	GroupA   string `json:"group_a"`
	GroupB   string `json:"group_b"`
	MatchedA string `json:"matched_a"`
	MatchedB string `json:"matched_b"`
}

// LinkCheckHandler serves GET /api/{cube}/stats/link-check for the cards
// named by "a" and "b". Groups resolve over the cube plus the cut cards decks
// played, the same cards the deck map shows.
func LinkCheckHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &linkCheckHandler{store: store, src: src}
}

type linkCheckHandler struct {
	store storage.DeckStorage
	src   types.CubeSource
}

// ServeHTTP answers one link check: 404 when either card is unknown.
func (h *linkCheckHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	rules, err := rulebook.Load(h.store, h.src, server.CubeFromRequest(r))
	if err != nil {
		logrus.WithError(err).Error("could not load the rules for a link check")
		http.Error(rw, "could not load rules", http.StatusInternalServerError)
		return
	}
	a, _, okA := lookupCard(rules.Cube(), query.GetString(r, "a"))
	b, _, okB := lookupCard(rules.Cube(), query.GetString(r, "b"))
	if !okA || !okB {
		http.Error(rw, "unknown card", http.StatusNotFound)
		return
	}
	writeJSON(rw, buildLinkCheck(rules, a, b), "link check")
}

// buildLinkCheck works out how the rules relate cards a and b.
func buildLinkCheck(rules *rulebook.Rulebook, a, b types.Card) LinkCheckResponse {
	config := rules.Config()
	rel := newCardRelations(rules.Cube(), config, rules.DeckCardNames(), []types.Card{a, b})
	return LinkCheckResponse{
		A:     LinkCard{Name: a.Name, Groups: groupUsesOf(rel.groupsOf(a.Name), config)},
		B:     LinkCard{Name: b.Name, Groups: groupUsesOf(rel.groupsOf(b.Name), config)},
		Links: linkThreads(rel, a, b, config),
	}
}

// groupUsesOf pairs each named group with the wires that use it.
func groupUsesOf(groups []string, config design.DesignMapConfig) []GroupUses {
	out := []GroupUses{}
	for _, g := range groups {
		out = append(out, GroupUses{Group: g, Uses: wireUses(g, config)})
	}
	return out
}

// wireUses lists every package wire naming the entry, by package then wire.
func wireUses(entry string, config design.DesignMapConfig) []WireUse {
	out := []WireUse{}
	for _, pkg := range config.Packages {
		for i, wire := range pkg.Wires {
			if slices.Contains(wire.Sources, entry) {
				out = append(out, WireUse{Package: pkg.Name, Wire: i, Side: "sources"})
			}
			if slices.Contains(wire.Targets, entry) {
				out = append(out, WireUse{Package: pkg.Name, Wire: i, Side: "targets"})
			}
		}
	}
	slices.SortFunc(out, func(x, y WireUse) int {
		return cmp.Or(cmp.Compare(x.Package, y.Package), cmp.Compare(x.Wire, y.Wire), cmp.Compare(x.Side, y.Side))
	})
	return out
}

// linkThreads lists every wire with one card's entry on one side and the
// other card's on the other, card A's entry first, each once.
func linkThreads(rel cardRelations, a, b types.Card, config design.DesignMapConfig) []LinkThread {
	matcher := rulebook.NewMatcher(config.Groups)

	seen := map[LinkThread]bool{}
	out := []LinkThread{}
	add := func(pkg string, wire int, entryA, entryB string) {
		thread := LinkThread{
			Package:  pkg,
			Wire:     wire,
			GroupA:   entryA,
			GroupB:   entryB,
			MatchedA: firstMatch(matcher, a, entryA),
			MatchedB: firstMatch(matcher, b, entryB),
		}
		if !seen[thread] {
			seen[thread] = true
			out = append(out, thread)
		}
	}

	// A wire links the cards when each card is in an entry on opposite sides,
	// in either direction.
	for _, pkg := range config.Packages {
		for i, wire := range pkg.Wires {
			for _, source := range wire.Sources {
				for _, target := range wire.Targets {
					if rel.groups[source][a.Name] && rel.groups[target][b.Name] {
						add(pkg.Name, i, source, target)
					}
					if rel.groups[source][b.Name] && rel.groups[target][a.Name] {
						add(pkg.Name, i, target, source)
					}
				}
			}
		}
	}
	return out
}

// firstMatch is the first of the entry's conditions the card matches, or ""
// when none does, as for a card: entry, which has no group.
func firstMatch(matcher rulebook.Matcher, card types.Card, entry string) string {
	for _, m := range matcher.Match(card) {
		if m.Group.Name == entry {
			return m.Group.Conditions[m.Conditions[0]]
		}
	}
	return ""
}
