package stats

import (
	"cmp"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/httperr"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
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

// DesignGraphEdge is a card-level connection between two cards, weighted by the packages that join them.
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
	// members when the group is selected. The client computes node degree from
	// whichever edge set is active.
	Cards []string `json:"cards"`

	// ExcludedCards lists cards that matched the group's conditions but were
	// carved out by the group's exclude list, so the editor can show them
	// grayed with a restore action.
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

// DesignGraphHandler serves the design graph for the cube, or one deck's built subgraph when the request names a deck.
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
			resp = buildDeckGraph(rules, shown.Config(), deck)
			resp.DeckPackages = builtPackages(shown.Packages(), deck)
		} else {
			resp = designGraph(rules, config)
		}

		writeJSON(rw, resp, "design graph")
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
func buildDeckGraph(rules *rulebook.Rulebook, config design.DesignMapConfig, deck *storage.Deck) DesignGraphResponse {
	names := map[string]bool{}
	for _, board := range [][]types.Card{deck.Mainboard, deck.Sideboard, deck.Pool} {
		for _, c := range board {
			names[c.Name] = true
		}
	}
	nodes := map[string]types.Card{}
	for name, c := range rules.CardMap() {
		if names[name] {
			nodes[name] = c
		}
	}
	linkable := map[string]bool{}
	for name := range linkableNames(rules) {
		if names[name] {
			linkable[name] = true
		}
	}
	g := buildDesignGraph(nodes, rules.Groups(), config, linkable)
	g.GroupNodes = []DesignGraphGroupNode{}
	g.GroupEdges = []DesignGraphGroupEdge{}
	return g
}

// designGraph builds the design graph over today's list and the rules in
// config, which may hold only the packages a view shows.
func designGraph(rules *rulebook.Rulebook, config design.DesignMapConfig) DesignGraphResponse {
	return buildDesignGraph(rules.CardMap(), rules.Groups(), config, linkableNames(rules))
}

// linkableNames is the cards the graph may link: today's list and the cut
// cards decks played. A cut card only an old draft list held links nothing.
func linkableNames(rules *rulebook.Rulebook) map[string]bool {
	out := map[string]bool{}
	for name := range rules.CardMap() {
		out[name] = true
	}
	for _, name := range rules.PlayedCardNames() {
		out[name] = true
	}
	return out
}

// restrict returns members holding only the cards keep names.
func restrict(members rulebook.Members, keep map[string]bool) rulebook.Members {
	out := make(rulebook.Members, len(members))
	for entry, cards := range members {
		kept := map[string]bool{}
		for name := range cards {
			if keep[name] {
				kept[name] = true
			}
		}
		out[entry] = kept
	}
	return out
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

// DesignGraphMatchResponse lists the cards matching a set of conditions and groups.
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

		writeJSON(rw, DesignGraphMatchResponse{Cards: matchConditions(rules.CardMap(), rules.Config(), req)}, "design graph match")
	})
}

// matchConditions evaluates each request condition against the card map and
// returns the per-card breakdown, sorted by name. A condition whose owning
// group excludes the card is marked rather than dropped, so the editor can
// show the card grayed instead of silently losing it.
func matchConditions(cardMap map[string]types.Card, config design.DesignMapConfig, req DesignGraphMatchRequest) []MatchedCard {
	excludes := make(map[string][]string, len(config.Groups))
	for _, g := range config.Groups {
		excludes[g.Name] = g.Exclude
	}

	// Each request condition is its own draft group, under its label and
	// with that saved group's exclude list.
	groups := make([]design.Group, len(req.Conditions))
	for i, cond := range req.Conditions {
		label := ""
		if i < len(req.Groups) {
			label = req.Groups[i]
		}
		groups[i] = design.Group{Name: label, Conditions: []string{cond}, Exclude: excludes[label]}
	}

	matcher := rulebook.NewDraftMatcher(groups)
	cardConditions := make(map[string][]MatchedCondition)
	for name, card := range cardMap {
		for _, m := range matcher.Match(card) {
			cardConditions[name] = append(cardConditions[name], MatchedCondition{
				Condition: m.Group.Conditions[0],
				Group:     m.Group.Name,
				Excluded:  m.Excluded,
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

// GroupDistributionsHandler serves how many of each group's cards appear in every deck's mainboard.
func GroupDistributionsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &groupDistributionsHandler{store: store, src: src}
}

type groupDistributionsHandler struct {
	store storage.DeckStorage
	src   types.CubeSource
}

// ServeHTTP loads the cube's rules and writes the per-deck group counts as JSON.
func (h *groupDistributionsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	logrus.Info("/api/stats/group-distributions")

	rules, err := rulebook.Load(h.store, h.src, server.CubeFromRequest(r))
	if err != nil {
		logrus.WithError(err).Error("could not load the rules for group distributions")
		http.Error(rw, "could not load the cube or its rules", http.StatusInternalServerError)
		return
	}

	writeJSON(rw, groupDistributions(rules, rules.Decks()), "group distributions")
}

// groupDistributions counts each group's cards in every deck's mainboard. Only
// decks with a real mainboard contribute, so the percentiles the client derives
// aren't diluted by pool-only records.
func groupDistributions(rules *rulebook.Rulebook, decks []*storage.Deck) GroupDistributionsResponse {
	config := rules.Config()
	cardMap := rules.CardMap()
	groupCards := rules.Groups().Cube

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

		lands := 0
		for name := range members {
			// cardMap excludes basic lands, but basics never match group
			// conditions, so a missing card can't skew the land fraction.
			if c, ok := cardMap[name]; ok && c.IsLand() {
				lands++
			}
		}

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
			Cards:      sortedCards(members),
			DeckCounts: counts,
			Manabase:   float64(lands)/float64(len(members)) >= manabaseLandFraction,
		})
	}

	return GroupDistributionsResponse{DeckCount: len(mainboards), Groups: groups}
}

// namePair is two names in sorted order, so the pair (A, B) and (B, A) are
// one key. Card edges, group edges and card pairs all use it.
type namePair struct {
	first  string
	second string
}

// newNamePair returns the pair of x and y in sorted order.
func newNamePair(x, y string) namePair {
	if y < x {
		x, y = y, x
	}
	return namePair{first: x, second: y}
}

// buildCardEdges creates one undirected edge per pair of cards joined by a
// package, stamped with every package that joins them.
func buildCardEdges(packages []design.Package, groupCards rulebook.Members) []DesignGraphEdge {
	edgePackages := make(map[namePair]map[string]bool)
	for _, pkg := range packages {
		for _, wire := range pkg.Wires {
			sources := groupCards.Side(wire.Sources)
			targets := groupCards.Side(wire.Targets)

			for s := range sources {
				for t := range targets {
					if s == t {
						continue
					}
					k := newNamePair(s, t)
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
		names := sortedCards(nameSet)
		edges = append(edges, DesignGraphEdge{
			Source:   k.first,
			Target:   k.second,
			Weight:   len(names),
			Packages: names,
		})
	}
	return edges
}

// buildDesignGraph builds the graph with cardMap's cards as its nodes. Edges
// also reach the linkable cut cards decks still play, so old decks keep them
// connected; nodes and the group graph stay on cardMap's cards.
func buildDesignGraph(cardMap map[string]types.Card, resolved rulebook.Groups, config design.DesignMapConfig, linkable map[string]bool) DesignGraphResponse {
	nodeNames := map[string]bool{}
	for name := range cardMap {
		nodeNames[name] = true
	}
	groupCards := restrict(resolved.Cube, nodeNames)
	groupExcluded := map[string][]string{}
	for group, names := range resolved.Excluded {
		for _, name := range names {
			if nodeNames[name] {
				groupExcluded[group] = append(groupExcluded[group], name)
			}
		}
	}

	edges := buildCardEdges(config.Packages, restrict(resolved.Widened, linkable))

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
		return compareNamesIgnoringCase(a.Name, b.Name)
	})
	packages := make([]design.Package, len(config.Packages))
	copy(packages, config.Packages)
	slices.SortFunc(packages, func(a, b design.Package) int {
		return compareNamesIgnoringCase(a.Name, b.Name)
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

// buildGroupGraph aggregates the card-level graph up to the group level. It
// returns one node per group, the card edges, and the package edges. Card edges
// join two groups when a card in one connects to a card in the other, weighted
// by the distinct card pairs spanning them. Package edges join two groups when
// a package names one as a source and the other as a target.
func buildGroupGraph(
	config design.DesignMapConfig,
	groupCards rulebook.Members,
	groupExcluded map[string][]string,
	edges []DesignGraphEdge,
) ([]DesignGraphGroupNode, []DesignGraphGroupEdge, []DesignGraphGroupEdge) {
	return buildGroupNodes(config, groupCards, groupExcluded), buildGroupCardEdges(groupCards, edges), buildGroupPackageEdges(config, groupCards)
}

// groupEdgeSet accumulates group edges: for each pair of groups, the distinct
// card pairs that give the edge its weight and the packages that join them.
type groupEdgeSet struct {
	cardPairs map[namePair]map[namePair]bool
	packages  map[namePair]map[string]bool
}

// newGroupEdgeSet returns an empty set.
func newGroupEdgeSet() *groupEdgeSet {
	return &groupEdgeSet{cardPairs: map[namePair]map[namePair]bool{}, packages: map[namePair]map[string]bool{}}
}

// join records that the packages join the two groups, creating their edge if
// it's new, and returns the edge's key for addCardPair.
func (s *groupEdgeSet) join(x, y string, packages []string) namePair {
	key := newNamePair(x, y)
	if s.cardPairs[key] == nil {
		s.cardPairs[key] = map[namePair]bool{}
		s.packages[key] = map[string]bool{}
	}
	for _, name := range packages {
		s.packages[key][name] = true
	}
	return key
}

// addCardPair counts a card pair toward the weight of the edge join returned.
func (s *groupEdgeSet) addCardPair(edge, cards namePair) {
	s.cardPairs[edge][cards] = true
}

// edges lists the accumulated edges sorted by source then target.
func (s *groupEdgeSet) edges() []DesignGraphGroupEdge {
	out := make([]DesignGraphGroupEdge, 0, len(s.cardPairs))
	for key, pairs := range s.cardPairs {
		out = append(out, DesignGraphGroupEdge{
			Source:   key.first,
			Target:   key.second,
			Weight:   len(pairs),
			Packages: sortedCards(s.packages[key]),
		})
	}
	slices.SortFunc(out, func(a, b DesignGraphGroupEdge) int {
		return cmp.Or(strings.Compare(a.Source, b.Source), strings.Compare(a.Target, b.Target))
	})
	return out
}

// buildGroupCardEdges collapses each card-level edge onto every pair of groups
// its endpoints belong to. Two cards in the same group are inside that group,
// so they make no edge.
func buildGroupCardEdges(groupCards rulebook.Members, edges []DesignGraphEdge) []DesignGraphGroupEdge {
	// Reverse index: card name to the groups holding it (a card can be in many).
	cardGroups := make(map[string][]string)
	for group, cards := range groupCards {
		for name := range cards {
			cardGroups[name] = append(cardGroups[name], group)
		}
	}

	set := newGroupEdgeSet()
	for _, e := range edges {
		cards := newNamePair(e.Source, e.Target)
		for _, source := range cardGroups[e.Source] {
			for _, target := range cardGroups[e.Target] {
				if source == target {
					continue
				}
				set.addCardPair(set.join(source, target, e.Packages), cards)
			}
		}
	}
	return set.edges()
}

// buildGroupPackageEdges makes one edge per pair of groups a package names on
// opposite sides of a wire, weighted by every card pair the package implies
// between them. A pair of groups with no cards still gets an edge.
func buildGroupPackageEdges(config design.DesignMapConfig, groupCards rulebook.Members) []DesignGraphGroupEdge {
	set := newGroupEdgeSet()
	for _, pkg := range config.Packages {
		for _, wire := range pkg.Wires {
			for _, source := range wire.Sources {
				for _, target := range wire.Targets {
					if source == target {
						continue
					}
					edge := set.join(source, target, []string{pkg.Name})
					for s := range groupCards[source] {
						for t := range groupCards[target] {
							if s != t {
								set.addCardPair(edge, newNamePair(s, t))
							}
						}
					}
				}
			}
		}
	}
	return set.edges()
}

// buildGroupNodes makes one node per group with its members, then one per
// "card:" wire entry so card endpoints show up on the theme-level map next to
// the groups. Nodes are sorted by name ignoring case.
func buildGroupNodes(config design.DesignMapConfig, groupCards rulebook.Members, groupExcluded map[string][]string) []DesignGraphGroupNode {
	nodes := make([]DesignGraphGroupNode, 0, len(config.Groups))
	for _, g := range config.Groups {
		cards := sortedCards(groupCards[g.Name])
		nodes = append(nodes, DesignGraphGroupNode{
			Name:          g.Name,
			Kind:          "group",
			CardCount:     len(cards),
			Cards:         cards,
			ExcludedCards: groupExcluded[g.Name],
		})
	}
	for entry, members := range groupCards {
		if design.CardRefName(entry) == "" {
			continue
		}
		cards := sortedCards(members)
		nodes = append(nodes, DesignGraphGroupNode{Name: entry, Kind: "card", CardCount: len(cards), Cards: cards})
	}
	slices.SortFunc(nodes, func(a, b DesignGraphGroupNode) int {
		return compareNamesIgnoringCase(a.Name, b.Name)
	})
	return nodes
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
