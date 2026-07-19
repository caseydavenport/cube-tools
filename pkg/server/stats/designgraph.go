package stats

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// Group defines a named set of cards selected by query conditions.
type Group struct {
	Name       string   `json:"name"`
	Conditions []string `json:"conditions"`

	// Exclude carves specific cards out of the condition matches by exact name,
	// so a query can stay broad without per-condition negations.
	Exclude []string `json:"exclude,omitempty"`
}

// Wire pairs source groups with target groups; cards from all source groups
// get edges to cards from all target groups. An entry prefixed "card:" names a
// single card directly instead of a group.
type Wire struct {
	Sources []string `json:"sources"`
	Targets []string `json:"targets"`
}

const cardRefPrefix = "card:"

// cardRefName returns the card name for a "card:" wire entry, or "" if the
// entry is a group name.
func cardRefName(entry string) string {
	name, ok := strings.CutPrefix(entry, cardRefPrefix)
	if !ok {
		return ""
	}
	return name
}

// Link connects named groups under a single label, via one or more wires.
type Link struct {
	Label string `json:"label"`
	Wires []Wire `json:"wires"`
}

// DesignMapConfig is the persistent format stored in cube-rules.json.
type DesignMapConfig struct {
	Groups []Group `json:"groups"`
	Links  []Link  `json:"links"`
}

// DesignGraphResponse is the API response for /api/stats/design-graph.
type DesignGraphResponse struct {
	Nodes  []DesignGraphNode `json:"nodes"`
	Edges  []DesignGraphEdge `json:"edges"`
	Groups []Group           `json:"groups"`
	Links  []Link            `json:"links"`

	// GroupNodes is the aggregated group-level node set, where each node is a group
	// rather than a card. The UI toggles between this and the card-level graph.
	GroupNodes []DesignGraphGroupNode `json:"group_nodes"`

	// GroupEdges connect groups based on actual card-level connections: two groups
	// are joined when a card in one is linked to a card in the other.
	GroupEdges []DesignGraphGroupEdge `json:"group_edges"`

	// LinkEdges connect groups based on the rule/link definitions directly, mirroring
	// how the links wire groups together regardless of card membership.
	LinkEdges []DesignGraphGroupEdge `json:"link_edges"`
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

	// Weight is the number of rules that connect these two cards (i.e., how many group links they share).
	Weight int `json:"weight"`

	// RuleLabels is the list of link labels that connect the source and target cards, derived from the groups they belong to.
	RuleLabels []string `json:"rule_labels"`
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
	// (card-derived vs. link-derived), so the client computes node degree from
	// whichever edge set is active rather than baking it in here.
	Cards []string `json:"cards"`

	// ExcludedCards lists cards that matched the group's conditions but were
	// carved out by the group's exclude list, so the editor can show them
	// greyed with a restore action.
	ExcludedCards []string `json:"excluded_cards,omitempty"`
}

// DesignGraphGroupEdge represents a link between two groups in the group-level graph.
type DesignGraphGroupEdge struct {
	// Source and Target are group names.
	Source string `json:"source"`
	Target string `json:"target"`

	// Weight is the number of distinct card-pairs this group connection represents,
	// so thicker edges mean denser interaction between the two groups.
	Weight int `json:"weight"`

	// Labels is the list of link labels that connect the two groups.
	Labels []string `json:"labels"`
}

func DesignGraphHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		logrus.Info("/api/stats/design-graph")

		cubeID := server.CubeFromRequest(r)
		cube, err := types.LoadCube(fmt.Sprintf("data/%s/cube.json", cubeID))
		if err != nil {
			http.Error(rw, "could not load cube", http.StatusInternalServerError)
			return
		}

		config, err := loadDesignMap(fmt.Sprintf("data/%s/cube-rules.json", cubeID))
		if err != nil {
			logrus.WithError(err).Warn("could not load cube rules")
			config = DesignMapConfig{}
		}

		resp := buildDesignGraph(cube, config)

		b, err := json.Marshal(resp)
		if err != nil {
			http.Error(rw, "could not marshal response", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		rw.Write(b)
	})
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
func DesignGraphMatchHandler() http.Handler {
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

		cubeID := server.CubeFromRequest(r)
		cube, err := types.LoadCube(fmt.Sprintf("data/%s/cube.json", cubeID))
		if err != nil {
			http.Error(rw, "could not load cube", http.StatusInternalServerError)
			return
		}

		// Build a map of card name to card data for efficient lookups, excluding basic lands.
		cardMap := buildCardMap(cube)

		// Saved rules supply the per-group exclude lists so matches can be
		// marked. Missing rules just means nothing gets marked excluded.
		config, err := loadDesignMap(fmt.Sprintf("data/%s/cube-rules.json", cubeID))
		if err != nil {
			logrus.WithError(err).Debug("could not load cube rules for match")
			config = DesignMapConfig{}
		}

		resp := DesignGraphMatchResponse{Cards: matchConditions(cardMap, config, req)}
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
func matchConditions(cardMap map[string]types.Card, config DesignMapConfig, req DesignGraphMatchRequest) []MatchedCard {
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

// buildCardMap creates a name->card lookup from a cube, excluding basic lands
// and enriching multi-face cards with oracle data.
func buildCardMap(cube *types.Cube) map[string]types.Card {
	cardMap := make(map[string]types.Card)
	for _, c := range cube.Cards {
		if c.IsBasicLand() {
			continue
		}
		if c.OracleText == "" {
			o := types.GetOracleData(c.Name)
			if o.Name != "" {
				enriched := types.FromOracle(o)
				c.OracleText = enriched.OracleText
			}
		}
		cardMap[c.Name] = c
	}
	return cardMap
}

// loadDesignMap reads the design map configuration from a JSON file and unmarshals it into a DesignMapConfig struct.
func loadDesignMap(path string) (DesignMapConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return DesignMapConfig{}, err
	}
	var config DesignMapConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return DesignMapConfig{}, err
	}
	return config, nil
}

func buildDesignGraph(cube *types.Cube, config DesignMapConfig) DesignGraphResponse {
	cardMap := buildCardMap(cube)

	// Pre-resolve all groups to card sets. Excluded cards are subtracted here,
	// so everything downstream (edges, group nodes, group edges) never sees
	// them; the carved-out matches are kept aside for the editor to display.
	groupCards := make(map[string]map[string]bool)
	groupExcluded := make(map[string][]string)
	for _, g := range config.Groups {
		cards := make(map[string]bool)
		for _, cond := range g.Conditions {
			for name := range matchCards(cardMap, cond) {
				cards[name] = true
			}
		}
		for _, name := range g.Exclude {
			if cards[name] {
				delete(cards, name)
				groupExcluded[g.Name] = append(groupExcluded[g.Name], name)
			}
		}
		slices.Sort(groupExcluded[g.Name])
		groupCards[g.Name] = cards
	}

	// Register each card: wire entry as a single-card pseudo-group, so the wire
	// and group-graph loops below need no special cases. An unknown card (typo,
	// or cut from the cube) resolves empty, same as a dangling group name.
	for _, link := range config.Links {
		for _, wire := range link.Wires {
			for _, entry := range slices.Concat(wire.Sources, wire.Targets) {
				name := cardRefName(entry)
				if name == "" {
					continue
				}
				cards := make(map[string]bool)
				if _, ok := cardMap[name]; ok {
					cards[name] = true
				}
				groupCards[entry] = cards
			}
		}
	}

	// Process links: look up source/target groups, create edges.
	type edgeKey struct{ source, target string }
	edgeLabels := make(map[edgeKey]map[string]bool)

	for _, link := range config.Links {
		for _, wire := range link.Wires {
			// Union cards from all source groups and all target groups.
			sources := make(map[string]bool)
			for _, gn := range wire.Sources {
				for name := range groupCards[gn] {
					sources[name] = true
				}
			}
			targets := make(map[string]bool)
			for _, gn := range wire.Targets {
				for name := range groupCards[gn] {
					targets[name] = true
				}
			}

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
					if edgeLabels[k] == nil {
						edgeLabels[k] = make(map[string]bool)
					}
					edgeLabels[k][link.Label] = true
				}
			}
		}
	}

	// Build edges and count connections per node.
	nodeCounts := make(map[string]int)
	var edges []DesignGraphEdge
	for k, labelSet := range edgeLabels {
		labels := make([]string, 0, len(labelSet))
		for l := range labelSet {
			labels = append(labels, l)
		}
		nodeCounts[k.source]++
		nodeCounts[k.target]++
		edges = append(edges, DesignGraphEdge{
			Source:     k.source,
			Target:     k.target,
			Weight:     len(labels),
			RuleLabels: labels,
		})
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

	// Sort groups and links by name/label for consistent display order.
	groups := make([]Group, len(config.Groups))
	copy(groups, config.Groups)
	slices.SortFunc(groups, func(a, b Group) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	links := make([]Link, len(config.Links))
	copy(links, config.Links)
	slices.SortFunc(links, func(a, b Link) int {
		return strings.Compare(strings.ToLower(a.Label), strings.ToLower(b.Label))
	})

	groupNodes, groupEdges, linkEdges := buildGroupGraph(config, groupCards, groupExcluded, edges)

	return DesignGraphResponse{
		Nodes:      nodes,
		Edges:      edges,
		Groups:     groups,
		Links:      links,
		GroupNodes: groupNodes,
		GroupEdges: groupEdges,
		LinkEdges:  linkEdges,
	}
}

// buildGroupGraph aggregates the card-level graph up to the group level: one node
// per group, plus two edge sets between groups.
//
// cardEdges are derived from the actual card-level connections: two groups are joined
// whenever a card in one is linked to a card in the other, with weight equal to the
// number of distinct card-pairs spanning them. A card in multiple groups contributes
// to all of them, so this reflects how the groups actually relate through their cards.
//
// linkEdges instead mirror the rule/link definitions directly: two groups are joined
// when a link names one as a source and the other as a target. This is the raw view of
// how the rules wire the groups together.
func buildGroupGraph(config DesignMapConfig, groupCards map[string]map[string]bool, groupExcluded map[string][]string, edges []DesignGraphEdge) (groupNodes []DesignGraphGroupNode, cardEdges, linkEdges []DesignGraphGroupEdge) {
	type groupEdgeKey struct{ source, target string }
	type cardPair struct{ a, b string }

	// finalize turns the accumulated card-pair and label maps into a sorted edge slice.
	finalize := func(pairs map[groupEdgeKey]map[cardPair]bool, labelSets map[groupEdgeKey]map[string]bool) []DesignGraphGroupEdge {
		out := make([]DesignGraphGroupEdge, 0, len(pairs))
		for gk, ps := range pairs {
			labels := make([]string, 0, len(labelSets[gk]))
			for l := range labelSets[gk] {
				labels = append(labels, l)
			}
			slices.Sort(labels)
			out = append(out, DesignGraphGroupEdge{
				Source: gk.source,
				Target: gk.target,
				Weight: len(ps),
				Labels: labels,
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
	cardLabels := make(map[groupEdgeKey]map[string]bool)
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
				// Skip when both endpoints share a group: that's an intra-group link, not a group-to-group edge.
				if a == b {
					continue
				}
				gk := groupEdgeKey{a, b}
				if cardPairs[gk] == nil {
					cardPairs[gk] = make(map[cardPair]bool)
					cardLabels[gk] = make(map[string]bool)
				}
				cardPairs[gk][cardPair{ca, cb}] = true
				for _, l := range e.RuleLabels {
					cardLabels[gk][l] = true
				}
			}
		}
	}
	cardEdges = finalize(cardPairs, cardLabels)

	// linkEdges: one edge per pair of groups named together by a link, weighted by the
	// full set of card-pairs the link implies between the two groups.
	linkPairs := make(map[groupEdgeKey]map[cardPair]bool)
	linkLabels := make(map[groupEdgeKey]map[string]bool)
	for _, link := range config.Links {
		for _, wire := range link.Wires {
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
					if linkPairs[gk] == nil {
						linkPairs[gk] = make(map[cardPair]bool)
						linkLabels[gk] = make(map[string]bool)
					}
					linkLabels[gk][link.Label] = true
					for s := range groupCards[gs] {
						for t := range groupCards[gt] {
							if s == t {
								continue
							}
							cs, ct := s, t
							if cs > ct {
								cs, ct = ct, cs
							}
							linkPairs[gk][cardPair{cs, ct}] = true
						}
					}
				}
			}
		}
	}
	linkEdges = finalize(linkPairs, linkLabels)

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
		if cardRefName(key) == "" {
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

	return groupNodes, cardEdges, linkEdges
}

// matchCards evaluates a query string against all cards and returns the set
// of matching card names. The query language supports:
//
//	n:text      - card name contains text (case-insensitive)
//	o:text      - oracle text contains text (case-insensitive)
//	t:text      - card has type containing text (e.g., t:creature)
//	st:text     - card has subtype containing text (e.g., st:zombie)
//	c:COLORS    - card's colors include at least one of the listed colors (e.g., c:R, c:UB)
//	cmc:N       - CMC equals N
//	cmc<N       - CMC less than N
//	cmc<=N      - CMC at most N
//	cmc>N       - CMC greater than N
//	cmc>=N      - CMC at least N
//	pow<N       - power less than N
//	pow<=N      - power at most N
//	pow>=N      - power at least N
//	tou<=N      - toughness at most N
//	tou>=N      - toughness at least N
//	m:text      - mana cost contains text (e.g., m:X, m:{W}{W})
//	is:keyword  - built-in classification (creature, land, removal, counterspell, interaction)
//
// Negation: prefix any term with ! to negate it: !t:creature, !c:R, !is:land
//
// Multiple terms are ANDed. Use OR between terms for disjunction.
// Use parentheses for grouping: (t:enchantment OR t:artifact) cmc<=2
func matchCards(cards map[string]types.Card, query string) map[string]bool {
	result := make(map[string]bool)
	tokens := tokenize(query)
	expr := parseExpr(&tokens)

	for name, card := range cards {
		if expr.matches(card) {
			result[name] = true
		}
	}

	return result
}

// --- Expression tree ---

type exprNode interface {
	matches(card types.Card) bool
}

type termNode struct {
	term    string
	negated bool
}

func (n *termNode) matches(card types.Card) bool {
	result := matchTerm(card, n.term)
	if n.negated {
		return !result
	}
	return result
}

type andNode struct {
	children []exprNode
}

func (n *andNode) matches(card types.Card) bool {
	for _, child := range n.children {
		if !child.matches(card) {
			return false
		}
	}
	return true
}

type orNode struct {
	children []exprNode
}

func (n *orNode) matches(card types.Card) bool {
	for _, child := range n.children {
		if child.matches(card) {
			return true
		}
	}
	return false
}

// --- Parser: recursive descent ---
// Grammar:
//   expr    = andExpr ("OR" andExpr)*
//   andExpr = primary ("AND"? primary)*
//   primary = "(" expr ")" | "!" primary | term

func parseExpr(tokens *[]string) exprNode {
	left := parseAndExpr(tokens)
	var orChildren []exprNode
	orChildren = append(orChildren, left)

	for len(*tokens) > 0 && (*tokens)[0] == "OR" {
		*tokens = (*tokens)[1:] // consume OR
		orChildren = append(orChildren, parseAndExpr(tokens))
	}

	if len(orChildren) == 1 {
		return orChildren[0]
	}
	return &orNode{children: orChildren}
}

func parseAndExpr(tokens *[]string) exprNode {
	left := parsePrimary(tokens)
	var andChildren []exprNode
	andChildren = append(andChildren, left)

	for len(*tokens) > 0 {
		tok := (*tokens)[0]
		if tok == ")" || tok == "OR" {
			break
		}
		if tok == "AND" {
			*tokens = (*tokens)[1:] // consume explicit AND
		}
		andChildren = append(andChildren, parsePrimary(tokens))
	}

	if len(andChildren) == 1 {
		return andChildren[0]
	}
	return &andNode{children: andChildren}
}

func parsePrimary(tokens *[]string) exprNode {
	if len(*tokens) == 0 {
		return &termNode{term: ""}
	}

	tok := (*tokens)[0]

	// Parenthesized group.
	if tok == "(" {
		*tokens = (*tokens)[1:] // consume (
		inner := parseExpr(tokens)
		if len(*tokens) > 0 && (*tokens)[0] == ")" {
			*tokens = (*tokens)[1:] // consume )
		}
		return inner
	}

	// Negation.
	if tok == "!" {
		*tokens = (*tokens)[1:] // consume !
		child := parsePrimary(tokens)
		// If the child is already a termNode, just flip its negated flag.
		if tn, ok := child.(*termNode); ok {
			tn.negated = !tn.negated
			return tn
		}
		// For complex negated expressions like !(a OR b), wrap in a negation.
		return &notNode{child: child}
	}

	// Term token (possibly with ! prefix baked in from tokenizer).
	*tokens = (*tokens)[1:]
	if strings.HasPrefix(tok, "!") {
		return &termNode{term: tok[1:], negated: true}
	}
	return &termNode{term: tok}
}

type notNode struct {
	child exprNode
}

func (n *notNode) matches(card types.Card) bool {
	return !n.child.matches(card)
}

// --- Tokenizer ---

// tokenize splits a query string into tokens: terms, "(", ")", "AND", "OR".
// Supports quoted values: o:"enters the battlefield"
// Supports negation prefix: !t:creature
func tokenize(query string) []string {
	var tokens []string
	i := 0
	for i < len(query) {
		// Skip whitespace.
		if query[i] == ' ' || query[i] == '\t' {
			i++
			continue
		}

		// Parentheses.
		if query[i] == '(' || query[i] == ')' {
			tokens = append(tokens, string(query[i]))
			i++
			continue
		}

		// Standalone negation: "!" followed by "(" or a term.
		if query[i] == '!' && i+1 < len(query) && query[i+1] == '(' {
			tokens = append(tokens, "!")
			i++
			continue
		}

		// Read a word/term until whitespace or paren.
		start := i
		for i < len(query) && query[i] != ' ' && query[i] != '\t' && query[i] != '(' && query[i] != ')' {
			// Handle quoted strings within a term.
			if query[i] == '"' {
				i++
				for i < len(query) && query[i] != '"' {
					i++
				}
				if i < len(query) {
					i++ // consume closing quote
				}
			} else {
				i++
			}
		}

		word := query[start:i]

		// Check for AND/OR keywords.
		if word == "AND" || word == "OR" {
			tokens = append(tokens, word)
			continue
		}

		// Strip quotes from within the term value (e.g., o:"foo bar" -> o:foo bar).
		word = stripTermQuotes(word)
		tokens = append(tokens, word)
	}
	return tokens
}

// stripTermQuotes removes quotes from the value portion of a term.
// e.g., o:"enters the battlefield" -> o:enters the battlefield
// e.g., !o:"foo" -> !o:foo
func stripTermQuotes(term string) string {
	// Find the colon that separates prefix from value.
	raw := term
	prefix := ""
	if strings.HasPrefix(raw, "!") {
		prefix = "!"
		raw = raw[1:]
	}
	colonIdx := strings.Index(raw, ":")
	if colonIdx == -1 {
		return term
	}
	key := raw[:colonIdx+1]
	val := raw[colonIdx+1:]
	// Strip surrounding quotes from value.
	if len(val) >= 2 && val[0] == '"' && val[len(val)-1] == '"' {
		val = val[1 : len(val)-1]
	}
	return prefix + key + val
}

func matchTerm(card types.Card, term string) bool {
	lower := strings.ToLower(term)

	// Handle comparison operators for cmc, pow, tou.
	// Check two-char ops (<=, >=) before single-char ops (<, >).
	for _, prefix := range []string{"cmc<=", "cmc>=", "pow<=", "pow>=", "tou<=", "tou>="} {
		if strings.HasPrefix(lower, prefix) {
			return matchComparison(card, prefix[:3], string(prefix[3:5]), lower[len(prefix):])
		}
	}
	for _, prefix := range []string{"cmc<", "cmc>", "pow<", "pow>", "tou<", "tou>"} {
		if strings.HasPrefix(lower, prefix) {
			return matchComparison(card, prefix[:3], string(prefix[3:4]), lower[len(prefix):])
		}
	}

	// Handle colon-based terms.
	if idx := strings.Index(term, ":"); idx != -1 {
		prefix := strings.ToLower(term[:idx])
		value := term[idx+1:]
		return matchPrefixedTerm(card, prefix, value)
	}

	// Bare term: match against card name.
	return wildcardMatch(strings.ToLower(card.Name), lower)
}

func matchPrefixedTerm(card types.Card, prefix, value string) bool {
	lowerValue := strings.ToLower(value)

	switch prefix {
	case "n":
		return wildcardMatch(strings.ToLower(card.Name), lowerValue)
	case "o":
		return wildcardMatch(strings.ToLower(card.OracleText), lowerValue)
	case "t":
		for _, t := range card.Types {
			if wildcardMatch(strings.ToLower(t), lowerValue) {
				return true
			}
		}
		for _, st := range card.SubTypes {
			if wildcardMatch(strings.ToLower(st), lowerValue) {
				return true
			}
		}
		return false
	case "st":
		for _, st := range card.SubTypes {
			if wildcardMatch(strings.ToLower(st), lowerValue) {
				return true
			}
		}
		return false
	case "m":
		return wildcardMatch(strings.ToLower(card.ManaCost), lowerValue)
	case "c":
		return matchColor(card, strings.ToUpper(value))
	case "cmc":
		n, err := strconv.Atoi(value)
		if err != nil {
			return false
		}
		return card.CMC == n
	case "is":
		return matchIs(card, lowerValue)
	default:
		logrus.WithField("prefix", prefix).Warn("unknown query prefix")
		return false
	}
}

// wildcardMatch checks if haystack contains the pattern, where * in pattern
// matches any sequence of characters. Without wildcards it behaves like
// strings.Contains.
func wildcardMatch(haystack, pattern string) bool {
	if !strings.Contains(pattern, "*") {
		return strings.Contains(haystack, pattern)
	}
	// Convert the wildcard pattern to a regex: escape regex metacharacters,
	// then replace * with .*
	escaped := regexp.QuoteMeta(pattern)
	escaped = strings.ReplaceAll(escaped, `\*`, ".*")
	re, err := regexp.Compile(escaped)
	if err != nil {
		return strings.Contains(haystack, pattern)
	}
	return re.MatchString(haystack)
}

// matchColor returns true if the card has at least one of the specified colors.
// e.g., "R" matches red cards, "UB" matches cards that are blue or black.
func matchColor(card types.Card, colors string) bool {
	for _, c := range colors {
		if slices.Contains(card.Colors, string(c)) {
			return true
		}
	}
	// If no colors specified or card is colorless, handle edge case.
	if len(colors) == 0 {
		return len(card.Colors) == 0
	}
	return false
}

func matchIs(card types.Card, keyword string) bool {
	switch keyword {
	case "creature":
		return card.IsCreature()
	case "land":
		return card.IsLand()
	case "removal":
		return card.IsRemoval()
	case "counterspell":
		return card.IsCounterspell()
	case "interaction":
		return card.IsInteraction()
	case "handhate":
		return card.IsHandHate()
	default:
		logrus.WithField("keyword", keyword).Warn("unknown is: keyword")
		return false
	}
}

func matchComparison(card types.Card, field, op, valueStr string) bool {
	n, err := strconv.Atoi(valueStr)
	if err != nil {
		return false
	}

	var cardVal int
	switch field {
	case "cmc":
		cardVal = card.CMC
	case "pow":
		v, err := strconv.Atoi(card.Power)
		if err != nil {
			return false
		}
		cardVal = v
	case "tou":
		v, err := strconv.Atoi(card.Toughness)
		if err != nil {
			return false
		}
		cardVal = v
	default:
		return false
	}

	switch op {
	case "<=":
		return cardVal <= n
	case ">=":
		return cardVal >= n
	case "<":
		return cardVal < n
	case ">":
		return cardVal > n
	default:
		return false
	}
}

// SaveDesignRulesHandler handles POST /api/save-design-rules to persist design map config.
func SaveDesignRulesHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var config DesignMapConfig
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			http.Error(rw, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
			return
		}

		data, err := json.MarshalIndent(config, "", "  ")
		if err != nil {
			http.Error(rw, "could not marshal config", http.StatusInternalServerError)
			return
		}

		cubeID := server.CubeFromRequest(r)
		if cubeID == "" {
			http.Error(rw, "no cube in request", http.StatusForbidden)
			return
		}
		if err := os.WriteFile(fmt.Sprintf("data/%s/cube-rules.json", cubeID), data, 0o644); err != nil {
			http.Error(rw, "could not save config", http.StatusInternalServerError)
			return
		}

		rw.WriteHeader(http.StatusOK)
	})
}
