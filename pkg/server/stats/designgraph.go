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

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// Group defines a named set of cards selected by query conditions.
type Group struct {
	Name       string   `json:"name"`
	Conditions []string `json:"conditions"`
}

// Link connects named groups, creating edges between their cards.
// Sources and targets are lists of group names; cards from all source groups
// get edges to cards from all target groups.
type Link struct {
	Label   string   `json:"label"`
	Sources []string `json:"sources"`
	Targets []string `json:"targets"`
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

func DesignGraphHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		logrus.Info("/api/stats/design-graph")

		cube, err := types.LoadCube("data/polyverse/cube.json")
		if err != nil {
			http.Error(rw, "could not load cube", http.StatusInternalServerError)
			return
		}

		config, err := loadDesignMap("data/polyverse/cube-rules.json")
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

		cube, err := types.LoadCube("data/polyverse/cube.json")
		if err != nil {
			http.Error(rw, "could not load cube", http.StatusInternalServerError)
			return
		}

		// Build a map of card name to card data for efficient lookups, excluding basic lands.
		cardMap := buildCardMap(cube)

		// For each condition, find matching cards and record which conditions each card matches. This
		// allows us to return a per-card breakdown of which conditions it matched, which is useful for debugging complex queries.
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
				})
			}
		}

		// Convert to a slice for JSON response and sort by card name for consistent display.
		cards := make([]MatchedCard, 0, len(cardConditions))
		for name, conds := range cardConditions {
			cards = append(cards, MatchedCard{Name: name, Conditions: conds})
		}
		slices.SortFunc(cards, func(a, b MatchedCard) int {
			return strings.Compare(a.Name, b.Name)
		})

		// Return the list of matched cards with their conditions.
		resp := DesignGraphMatchResponse{Cards: cards}
		b, err := json.Marshal(resp)
		if err != nil {
			http.Error(rw, "could not marshal response", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		rw.Write(b)
	})
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

	// Pre-resolve all groups to card sets.
	groupCards := make(map[string]map[string]bool)
	for _, g := range config.Groups {
		cards := make(map[string]bool)
		for _, cond := range g.Conditions {
			for name := range matchCards(cardMap, cond) {
				cards[name] = true
			}
		}
		groupCards[g.Name] = cards
	}

	// Process links: look up source/target groups, create edges.
	type edgeKey struct{ source, target string }
	edgeLabels := make(map[edgeKey]map[string]bool)

	for _, link := range config.Links {
		// Union cards from all source groups and all target groups.
		sources := make(map[string]bool)
		for _, gn := range link.Sources {
			for name := range groupCards[gn] {
				sources[name] = true
			}
		}
		targets := make(map[string]bool)
		for _, gn := range link.Targets {
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

	return DesignGraphResponse{
		Nodes:  nodes,
		Edges:  edges,
		Groups: groups,
		Links:  links,
	}
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

		if err := os.WriteFile("data/polyverse/cube-rules.json", data, 0o644); err != nil {
			http.Error(rw, "could not save config", http.StatusInternalServerError)
			return
		}

		rw.WriteHeader(http.StatusOK)
	})
}
