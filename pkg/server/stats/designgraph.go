package stats

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/httperr"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// DesignGraphResponse is the API response for /api/stats/design-graph.
type DesignGraphResponse struct {
	Nodes    []DesignGraphNode `json:"nodes"`
	Edges    []DesignGraphEdge `json:"edges"`
	Groups   []design.Group    `json:"groups"`
	Packages []design.Package  `json:"packages"`

	// GroupNodes is the aggregated group-level node set, where each node is a group
	// rather than a card. The UI toggles between this and the card-level graph.
	GroupNodes []DesignGraphGroupNode `json:"group_nodes"`

	// GroupEdges connect groups based on actual card-level connections: two groups
	// are joined when a card in one is connected to a card in the other.
	GroupEdges []DesignGraphGroupEdge `json:"group_edges"`

	// PackageEdges connect groups based on the package definitions directly,
	// mirroring how the packages wire groups together regardless of card membership.
	PackageEdges []DesignGraphGroupEdge `json:"package_edges"`

	// DeckPackages, for a graph of one deck, names the packages it builds,
	// judged on its draft's cube list, sorted by name.
	DeckPackages []string `json:"deck_packages,omitempty"`
}

// DesignGraphNode represents a card in the design graph, with metadata and connection count.
type DesignGraphNode struct {
	// Name is the card name, serving as the unique identifier for the node.
	Name string `json:"name"`

	// Colors is the list of color symbols for the card (e.g., ["R"], ["U", "B"], or [] for colorless).
	Colors []string `json:"colors"`

	// Types is the list of type and subtype strings for the card (e.g., ["Creature", "Human", "Soldier"]).
	Types []string `json:"types"`

	// CMC is the converted mana cost of the card.
	CMC int `json:"cmc"`

	// ConnectionCount is the number of edges connected to this node in the design graph.
	ConnectionCount int `json:"connection_count"`
}

type DesignGraphEdge struct {
	// Source and Target are card names.
	Source string `json:"source"`
	Target string `json:"target"`

	// Weight is the number of packages that connect these two cards.
	Weight int `json:"weight"`

	// Packages names the packages that connect the source and target cards,
	// derived from the groups they belong to.
	Packages []string `json:"packages"`
}

// DesignGraphGroupNode represents a group in the aggregated group-level graph.
type DesignGraphGroupNode struct {
	// Name is the group name, serving as the unique identifier for the node.
	Name string `json:"name"`

	// Kind distinguishes regular groups from "card:" wire references, which
	// appear in the group graph as single-card pseudo-groups.
	Kind string `json:"kind"`

	// CardCount is the number of cards matching the group's conditions.
	CardCount int `json:"card_count"`

	// Cards is the sorted list of card names in the group, so the UI can list
	// members when the group is selected. Connection counts are view-specific
	// (card-derived vs. package-derived), so the client computes node degree from
	// whichever edge set is active rather than baking it in here.
	Cards []string `json:"cards"`

	// ExcludedCards lists cards that matched the group's conditions but were
	// carved out by the group's exclude list, so the editor can show them
	// greyed with a restore action.
	ExcludedCards []string `json:"excluded_cards,omitempty"`
}

// DesignGraphGroupEdge represents a connection between two groups in the group-level graph.
type DesignGraphGroupEdge struct {
	// Source and Target are group names.
	Source string `json:"source"`
	Target string `json:"target"`

	// Weight is the number of distinct card-pairs this group connection represents,
	// so thicker edges mean denser interaction between the two groups.
	Weight int `json:"weight"`

	// Packages names the packages that connect the two groups.
	Packages []string `json:"packages"`
}

func DesignGraphHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		logrus.Info("/api/stats/design-graph")

		cubeID := server.CubeFromRequest(r)

		// A rules file that can't be read is an error, never an empty rule set:
		// the editor saves what it loads, over every cube's shared rules.
		rules, err := rulebook.Load(store, src, cubeID)
		if err != nil {
			logrus.WithError(err).Error("could not load the cube or its rules")
			http.Error(rw, "could not load the cube or its rules", http.StatusInternalServerError)
			return
		}

		// The decks page asks for one deck, so its links show only packages
		// that deck's draft list supported. Rules editors ask for all.
		config := rules.Config()
		if draft := query.GetString(r, "draft"); draft != "" {
			draftID, err := strconv.Atoi(draft)
			if err != nil {
				http.Error(rw, "draft must be a number", http.StatusBadRequest)
				return
			}
			config = rules.Shown(rulebook.InDraft(draftID)).Config()
		}
		var deck *storage.Deck
		if ref := query.GetString(r, "deck"); ref != "" {
			draftID, id, ok := decks.ParseDeckRef(ref)
			if !ok {
				http.Error(rw, "deck must be <draft_id>/<id>", http.StatusBadRequest)
				return
			}
			i := slices.IndexFunc(rules.Decks(), func(d *storage.Deck) bool {
				return d.Metadata.DraftID == draftID && d.ID == id
			})
			if i < 0 {
				http.Error(rw, "deck not found", http.StatusNotFound)
				return
			}
			deck = rules.Decks()[i]
		}

		var resp DesignGraphResponse
		if deck != nil {
			draftID := deck.Metadata.DraftID
			shown := rules.Shown(rulebook.InDraft(draftID))
			resp = buildDeckGraph(rules.Cube(), shown.Config(), deck, rules.PlayedCardNames())
			resp.DeckPackages = builtPackages(shown.Packages(), deck)
		} else {
			resp = buildDesignGraph(rules.Cube(), config, rules.PlayedCardNames())
		}

		b, err := json.Marshal(resp)
		if err != nil {
			http.Error(rw, "could not marshal response", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		rw.Write(b)
	})
}

// builtPackages names the packages the deck builds, sorted by name. Each
// package carries its relevance, so one its draft's list can't support isn't
// named.
func builtPackages(pkgs []design.PackageCards, deck *storage.Deck) []string {
	cards := deckCards(deck)
	out := []string{}
	for _, p := range pkgs {
		if p.BuiltIn(deck.Metadata.DraftID, cards) {
			out = append(out, p.Name)
		}
	}
	slices.Sort(out)
	return out
}

// buildDeckGraph builds the design graph of one deck: the nodes and edges
// among the cards in its mainboard, sideboard and pool. The decks page draws
// only those, and building the whole cube's graph takes over a second for
// tens of thousands of edges. As in the whole graph, a card cut from the cube
// links only if some deck mainboarded it. The group graph is the rules
// editor's, so it's left out.
func buildDeckGraph(cube *types.Cube, config design.DesignMapConfig, deck *storage.Deck, playedCardNames []string) DesignGraphResponse {
	names := map[string]bool{}
	for _, board := range [][]types.Card{deck.Mainboard, deck.Sideboard, deck.Pool} {
		for _, c := range board {
			names[c.Name] = true
		}
	}
	deckCube := &types.Cube{}
	for _, c := range cube.Cards {
		if names[c.Name] {
			deckCube.Cards = append(deckCube.Cards, c)
		}
	}
	var played []string
	for _, name := range playedCardNames {
		if names[name] {
			played = append(played, name)
		}
	}
	g := buildDesignGraph(deckCube, config, played)
	g.GroupNodes = []DesignGraphGroupNode{}
	g.GroupEdges = []DesignGraphGroupEdge{}
	return g
}

// MatchedCard describes a card and which conditions it matched.
type MatchedCard struct {
	Name       string             `json:"name"`
	Conditions []MatchedCondition `json:"conditions"`
}

// MatchedCondition records a condition string and optionally which group it came from.
type MatchedCondition struct {
	Condition string `json:"condition"`
	Group     string `json:"group,omitempty"`

	// Excluded means the condition matched, but the owning group's exclude
	// list carves this card out - the card is not an effective member via
	// this condition.
	Excluded bool `json:"excluded,omitempty"`
}

// DesignGraphMatchRequest is the request body for /api/stats/design-graph/match, containing conditions and groups to match against.
type DesignGraphMatchRequest struct {
	Conditions []string `json:"conditions"`
	Groups     []string `json:"groups"`
}

type DesignGraphMatchResponse struct {
	Cards []MatchedCard `json:"cards"`
}

// DesignGraphMatchHandler handles POST /api/stats/design-graph/match.
// It accepts {"conditions": ["o:mill", ...], "groups": ["GroupA", ...]} and returns
// matching cards with per-card condition info.
func DesignGraphMatchHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req DesignGraphMatchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
			return
		}

		// Saved rules supply the per-group exclude lists so matches can be
		// marked.
		rules, err := rulebook.Load(store, src, server.CubeFromRequest(r))
		if err != nil {
			logrus.WithError(err).Error("could not load the rules for a match")
			http.Error(rw, "could not load the cube or its rules", http.StatusInternalServerError)
			return
		}

		resp := DesignGraphMatchResponse{Cards: matchConditions(rules.CardMap(), rules.Config(), req)}
		b, err := json.Marshal(resp)
		if err != nil {
			http.Error(rw, "could not marshal response", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		rw.Write(b)
	})
}

// matchConditions evaluates each request condition against the card map and
// returns the per-card breakdown, sorted by name. A condition whose owning
// group excludes the card is marked rather than dropped, so the editor can
// show the card greyed instead of silently losing it.
func matchConditions(cardMap map[string]types.Card, config design.DesignMapConfig, req DesignGraphMatchRequest) []MatchedCard {
	excludes := make(map[string]map[string]bool)
	for _, g := range config.Groups {
		if len(g.Exclude) == 0 {
			continue
		}
		set := make(map[string]bool, len(g.Exclude))
		for _, name := range g.Exclude {
			set[name] = true
		}
		excludes[g.Name] = set
	}

	cardConditions := make(map[string][]MatchedCondition)
	for i, cond := range req.Conditions {
		group := ""
		if i < len(req.Groups) {
			group = req.Groups[i]
		}
		for name := range matchCards(cardMap, cond) {
			cardConditions[name] = append(cardConditions[name], MatchedCondition{
				Condition: cond,
				Group:     group,
				Excluded:  excludes[group][name],
			})
		}
	}

	cards := make([]MatchedCard, 0, len(cardConditions))
	for name, conds := range cardConditions {
		cards = append(cards, MatchedCard{Name: name, Conditions: conds})
	}
	slices.SortFunc(cards, func(a, b MatchedCard) int {
		return strings.Compare(a.Name, b.Name)
	})
	return cards
}

// GroupDistribution reports, for one design-map group, how many of the group's
// cards each deck runs. The client ranks a deck's groups by where its count
// falls in this distribution, so the widget surfaces the strategies a deck
// over-indexes on rather than whatever groups are simply largest in the cube.
type GroupDistribution struct {
	Name string `json:"name"`

	// Cards is the group's effective membership, so the client can count the
	// current deck without also fetching the design graph.
	Cards []string `json:"cards"`

	// DeckCounts holds one entry per deck: the number of the group's cards in
	// that deck's mainboard. Unordered; the client derives percentiles from it.
	DeckCounts []int `json:"deck_counts"`

	// Manabase marks groups that are almost entirely lands (fetches, duals,
	// basics). Running extra fixing isn't a strategy, so the client hides these.
	Manabase bool `json:"manabase"`
}

// GroupDistributionsResponse is the API response for /api/{cube}/stats/group-distributions.
type GroupDistributionsResponse struct {
	DeckCount int                 `json:"deck_count"`
	Groups    []GroupDistribution `json:"groups"`
}

// A deck needs at least this many mainboard cards to feed the distribution.
// Below it the deck is a pool-only record (games but no built decklist) whose
// zero counts would skew every group's percentiles downward.
const distributionMinDeckSize = 20

// manabaseLandFraction is the share of a group's cards that must be lands for it
// to read as manabase plumbing rather than a strategy.
const manabaseLandFraction = 0.8

func GroupDistributionsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &groupDistributionsHandler{store: store, src: src}
}

type groupDistributionsHandler struct {
	store storage.DeckStorage
	src   types.CubeSource
}

func (h *groupDistributionsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	logrus.Info("/api/stats/group-distributions")

	rules, err := rulebook.Load(h.store, h.src, server.CubeFromRequest(r))
	if err != nil {
		logrus.WithError(err).Error("could not load the rules for group distributions")
		http.Error(rw, "could not load the cube or its rules", http.StatusInternalServerError)
		return
	}

	resp := groupDistributions(rules.CardMap(), rules.Config(), rules.Decks())
	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write group distributions response")
	}
}

// groupDistributions counts each group's cards in every deck's mainboard. Only
// decks with a real mainboard contribute, so the percentiles the client derives
// aren't diluted by pool-only records.
func groupDistributions(cardMap map[string]types.Card, config design.DesignMapConfig, decks []*storage.Deck) GroupDistributionsResponse {
	groupCards, _ := rulebook.MatchGroups(cardMap, config.Groups)

	mainboards := make([]map[string]bool, 0, len(decks))
	for _, d := range decks {
		mb := d.GetMainboard()
		if len(mb) < distributionMinDeckSize {
			continue
		}
		names := make(map[string]bool, len(mb))
		for _, c := range mb {
			names[c.Name] = true
		}
		mainboards = append(mainboards, names)
	}

	groups := make([]GroupDistribution, 0, len(config.Groups))
	for _, g := range config.Groups {
		members := groupCards[g.Name]
		if len(members) == 0 {
			continue
		}

		cards := make([]string, 0, len(members))
		lands := 0
		for name := range members {
			cards = append(cards, name)

			// cardMap excludes basic lands, so a basic won't be found here - but
			// basics never match group conditions anyway, so it can't skew the
			// land fraction.
			if c, ok := cardMap[name]; ok && c.IsLand() {
				lands++
			}
		}
		slices.Sort(cards)

		counts := make([]int, len(mainboards))
		for i, names := range mainboards {
			for name := range members {
				if names[name] {
					counts[i]++
				}
			}
		}

		groups = append(groups, GroupDistribution{
			Name:       g.Name,
			Cards:      cards,
			DeckCounts: counts,
			Manabase:   float64(lands)/float64(len(members)) >= manabaseLandFraction,
		})
	}

	return GroupDistributionsResponse{DeckCount: len(mainboards), Groups: groups}
}

// buildCardEdges creates one undirected edge per pair of cards joined by a
// package, stamped with every package that joins them.
func buildCardEdges(packages []design.Package, groupCards map[string]map[string]bool) []DesignGraphEdge {
	type edgeKey struct{ source, target string }
	edgePackages := make(map[edgeKey]map[string]bool)

	for _, pkg := range packages {
		for _, wire := range pkg.Wires {
			sources := rulebook.WireSide(groupCards, wire.Sources)
			targets := rulebook.WireSide(groupCards, wire.Targets)

			for s := range sources {
				for t := range targets {
					if s == t {
						continue
					}
					// Normalize edge direction so (A,B) and (B,A) are the same edge.
					a, b := s, t
					if a > b {
						a, b = b, a
					}
					k := edgeKey{a, b}
					if edgePackages[k] == nil {
						edgePackages[k] = make(map[string]bool)
					}
					edgePackages[k][pkg.Name] = true
				}
			}
		}
	}

	var edges []DesignGraphEdge
	for k, nameSet := range edgePackages {
		names := make([]string, 0, len(nameSet))
		for n := range nameSet {
			names = append(names, n)
		}
		slices.Sort(names)
		edges = append(edges, DesignGraphEdge{
			Source:   k.source,
			Target:   k.target,
			Weight:   len(names),
			Packages: names,
		})
	}
	return edges
}

func buildDesignGraph(cube *types.Cube, config design.DesignMapConfig, deckCardNames []string) DesignGraphResponse {
	cardMap := rulebook.CardMap(cube)

	// Edges also reach cards cut from the cube that decks still play, so old
	// decks keep them connected. Nodes and the group graph stay cube-only.
	resolved := rulebook.ResolveGroups(cardMap, config, deckCardNames)
	groupCards, groupExcluded := resolved.Cube, resolved.Excluded

	edges := buildCardEdges(config.Packages, resolved.Widened)

	// Connection counts reflect cube-to-cube edges only, so a cut card's edges
	// don't inflate the counts shown in the cube's design view.
	nodeCounts := make(map[string]int)
	for _, e := range edges {
		if _, ok := cardMap[e.Source]; !ok {
			continue
		}
		if _, ok := cardMap[e.Target]; !ok {
			continue
		}
		nodeCounts[e.Source]++
		nodeCounts[e.Target]++
	}

	// Include all cards as nodes, not just connected ones.
	var nodes []DesignGraphNode
	for name, card := range cardMap {
		nodes = append(nodes, DesignGraphNode{
			Name:            name,
			Colors:          card.Colors,
			Types:           card.Types,
			CMC:             card.CMC,
			ConnectionCount: nodeCounts[name],
		})
	}

	// Sort groups and packages by name for consistent display order.
	groups := make([]design.Group, len(config.Groups))
	copy(groups, config.Groups)
	slices.SortFunc(groups, func(a, b design.Group) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	packages := make([]design.Package, len(config.Packages))
	copy(packages, config.Packages)
	slices.SortFunc(packages, func(a, b design.Package) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})

	groupNodes, groupEdges, packageEdges := buildGroupGraph(config, groupCards, groupExcluded, edges)

	return DesignGraphResponse{
		Nodes:        nodes,
		Edges:        edges,
		Groups:       groups,
		Packages:     packages,
		GroupNodes:   groupNodes,
		GroupEdges:   groupEdges,
		PackageEdges: packageEdges,
	}
}

// buildGroupGraph aggregates the card-level graph up to the group level: one node
// per group, plus two edge sets between groups.
//
// cardEdges are derived from the actual card-level connections: two groups are joined
// whenever a card in one is connected to a card in the other, with weight equal to the
// number of distinct card-pairs spanning them. A card in multiple groups contributes
// to all of them, so this reflects how the groups actually relate through their cards.
//
// packageEdges instead mirror the package definitions directly: two groups are
// joined when a package names one as a source and the other as a target. This is
// the raw view of how the rules wire the groups together.
func buildGroupGraph(
	config design.DesignMapConfig,
	groupCards map[string]map[string]bool,
	groupExcluded map[string][]string,
	edges []DesignGraphEdge,
) (groupNodes []DesignGraphGroupNode, cardEdges, packageEdges []DesignGraphGroupEdge) {
	type groupEdgeKey struct{ source, target string }
	type cardPair struct{ a, b string }

	// finalize turns the accumulated card-pair and package maps into a sorted edge slice.
	finalize := func(pairs map[groupEdgeKey]map[cardPair]bool, packageSets map[groupEdgeKey]map[string]bool) []DesignGraphGroupEdge {
		out := make([]DesignGraphGroupEdge, 0, len(pairs))
		for gk, ps := range pairs {
			names := make([]string, 0, len(packageSets[gk]))
			for n := range packageSets[gk] {
				names = append(names, n)
			}
			slices.Sort(names)
			out = append(out, DesignGraphGroupEdge{
				Source:   gk.source,
				Target:   gk.target,
				Weight:   len(ps),
				Packages: names,
			})
		}
		slices.SortFunc(out, func(a, b DesignGraphGroupEdge) int {
			if c := strings.Compare(a.Source, b.Source); c != 0 {
				return c
			}
			return strings.Compare(a.Target, b.Target)
		})
		return out
	}

	// cardEdges: collapse each card-level edge onto every pair of groups its endpoints
	// belong to. Reverse index card name -> the groups that contain it (a card can be in many).
	cardGroups := make(map[string][]string)
	for g, cards := range groupCards {
		for name := range cards {
			cardGroups[name] = append(cardGroups[name], g)
		}
	}
	cardPairs := make(map[groupEdgeKey]map[cardPair]bool)
	cardPackages := make(map[groupEdgeKey]map[string]bool)
	for _, e := range edges {
		ca, cb := e.Source, e.Target
		if ca > cb {
			ca, cb = cb, ca
		}
		for _, gs := range cardGroups[e.Source] {
			for _, gt := range cardGroups[e.Target] {
				// Normalize so (A,B) and (B,A) collapse to one group edge.
				a, b := gs, gt
				if a > b {
					a, b = b, a
				}

				// Skip when both endpoints share a group: that's an intra-group edge,
				// not a group-to-group edge.
				if a == b {
					continue
				}
				gk := groupEdgeKey{a, b}
				if cardPairs[gk] == nil {
					cardPairs[gk] = make(map[cardPair]bool)
					cardPackages[gk] = make(map[string]bool)
				}
				cardPairs[gk][cardPair{ca, cb}] = true
				for _, n := range e.Packages {
					cardPackages[gk][n] = true
				}
			}
		}
	}
	cardEdges = finalize(cardPairs, cardPackages)

	// packageEdges: one edge per pair of groups named together by a package,
	// weighted by the full set of card-pairs the package implies between them.
	packagePairs := make(map[groupEdgeKey]map[cardPair]bool)
	packageNames := make(map[groupEdgeKey]map[string]bool)
	for _, pkg := range config.Packages {
		for _, wire := range pkg.Wires {
			for _, gs := range wire.Sources {
				for _, gt := range wire.Targets {
					a, b := gs, gt
					if a > b {
						a, b = b, a
					}
					if a == b {
						continue
					}
					gk := groupEdgeKey{a, b}
					if packagePairs[gk] == nil {
						packagePairs[gk] = make(map[cardPair]bool)
						packageNames[gk] = make(map[string]bool)
					}
					packageNames[gk][pkg.Name] = true
					for s := range groupCards[gs] {
						for t := range groupCards[gt] {
							if s == t {
								continue
							}
							cs, ct := s, t
							if cs > ct {
								cs, ct = ct, cs
							}
							packagePairs[gk][cardPair{cs, ct}] = true
						}
					}
				}
			}
		}
	}
	packageEdges = finalize(packagePairs, packageNames)

	// nodes: one per group, with card membership.
	groupNodes = make([]DesignGraphGroupNode, 0, len(config.Groups))
	for _, g := range config.Groups {
		cards := make([]string, 0, len(groupCards[g.Name]))
		for name := range groupCards[g.Name] {
			cards = append(cards, name)
		}
		slices.Sort(cards)
		groupNodes = append(groupNodes, DesignGraphGroupNode{
			Name:          g.Name,
			Kind:          "group",
			CardCount:     len(cards),
			Cards:         cards,
			ExcludedCards: groupExcluded[g.Name],
		})
	}

	// Card: wire references get their own nodes so card endpoints show up on the
	// theme-level map alongside the groups.
	for key, cards := range groupCards {
		if design.CardRefName(key) == "" {
			continue
		}
		members := make([]string, 0, len(cards))
		for name := range cards {
			members = append(members, name)
		}
		slices.Sort(members)
		groupNodes = append(groupNodes, DesignGraphGroupNode{
			Name:      key,
			Kind:      "card",
			CardCount: len(members),
			Cards:     members,
		})
	}
	slices.SortFunc(groupNodes, func(a, b DesignGraphGroupNode) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})

	return groupNodes, cardEdges, packageEdges
}

// SaveDesignRulesHandler handles POST /api/save-design-rules to persist design map config.
func SaveDesignRulesHandler(store *storage.Store) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Unknown fields are refused so a page still running an older UI, which
		// sends "links" instead of "packages", can't save rules with no packages.
		var config design.DesignMapConfig
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		if err := dec.Decode(&config); err != nil {
			http.Error(rw, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
			return
		}

		cubeID := server.CubeFromRequest(r)
		if cubeID == "" {
			http.Error(rw, "no cube in request", http.StatusForbidden)
			return
		}
		if httperr.WriteStoreError(rw, store.PutRules(cubeID, &config), "could not save config for "+cubeID) {
			return
		}

		rw.WriteHeader(http.StatusOK)
	})
}
