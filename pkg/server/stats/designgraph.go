package stats

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// Rule defines a connection rule between two groups of cards.
// Match selects the source cards, Connect selects the target cards.
// Multiple connect clauses are combined with logical OR.
// All matched source cards get edges to all matched target cards.
type Rule struct {
	Match   string   `json:"match"`
	Connect []string `json:"connect"`
	Label   string   `json:"label"`
}

// DesignGraphResponse is the API response for /api/stats/design-graph.
type DesignGraphResponse struct {
	Nodes []DesignGraphNode `json:"nodes"`
	Edges []DesignGraphEdge `json:"edges"`
	Rules []Rule            `json:"rules"`
}

type DesignGraphNode struct {
	Name          string   `json:"name"`
	Colors        []string `json:"colors"`
	Types         []string `json:"types"`
	CMC           int      `json:"cmc"`
	ConnectionCount int    `json:"connection_count"`
}

type DesignGraphEdge struct {
	Source    string   `json:"source"`
	Target   string   `json:"target"`
	Weight   int      `json:"weight"`
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

		rules, err := loadRules("data/polyverse/cube-rules.json")
		if err != nil {
			logrus.WithError(err).Warn("could not load cube rules")
			// Return empty response rather than error - rules file may not exist yet.
			rules = []Rule{}
		}

		resp := buildDesignGraph(cube, rules)

		b, err := json.Marshal(resp)
		if err != nil {
			http.Error(rw, "could not marshal response", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		rw.Write(b)
	})
}

func loadRules(path string) ([]Rule, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var rules []Rule
	if err := json.Unmarshal(data, &rules); err != nil {
		return nil, err
	}
	return rules, nil
}

func buildDesignGraph(cube *types.Cube, rules []Rule) DesignGraphResponse {
	// Build a name->card lookup, excluding basic lands.
	cardMap := make(map[string]types.Card)
	for _, c := range cube.Cards {
		if c.IsBasicLand() {
			continue
		}
		cardMap[c.Name] = c
	}

	// For each rule, find matching source and target cards, create edges.
	type edgeKey struct{ source, target string }
	edgeLabels := make(map[edgeKey]map[string]bool) // edge -> set of rule labels

	for _, rule := range rules {
		sources := matchCards(cardMap, rule.Match)
		// Union targets from all connect clauses.
		targets := make(map[string]bool)
		for _, connectQuery := range rule.Connect {
			for name := range matchCards(cardMap, connectQuery) {
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
				edgeLabels[k][rule.Label] = true
			}
		}
	}

	// Collect all nodes that participate in at least one edge.
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

	var nodes []DesignGraphNode
	for name, count := range nodeCounts {
		card := cardMap[name]
		nodes = append(nodes, DesignGraphNode{
			Name:            name,
			Colors:          card.Colors,
			Types:           card.Types,
			CMC:             card.CMC,
			ConnectionCount: count,
		})
	}

	return DesignGraphResponse{
		Nodes: nodes,
		Edges: edges,
		Rules: rules,
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
	return strings.Contains(strings.ToLower(card.Name), lower)
}

func matchPrefixedTerm(card types.Card, prefix, value string) bool {
	lowerValue := strings.ToLower(value)

	switch prefix {
	case "n":
		return strings.Contains(strings.ToLower(card.Name), lowerValue)
	case "o":
		return strings.Contains(strings.ToLower(card.OracleText), lowerValue)
	case "t":
		for _, t := range card.Types {
			if strings.Contains(strings.ToLower(t), lowerValue) {
				return true
			}
		}
		return false
	case "st":
		for _, st := range card.SubTypes {
			if strings.Contains(strings.ToLower(st), lowerValue) {
				return true
			}
		}
		return false
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

// SaveRulesHandler handles POST /api/save-design-rules to persist rules edits.
func SaveDesignRulesHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var rules []Rule
		if err := json.NewDecoder(r.Body).Decode(&rules); err != nil {
			http.Error(rw, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
			return
		}

		data, err := json.MarshalIndent(rules, "", "  ")
		if err != nil {
			http.Error(rw, "could not marshal rules", http.StatusInternalServerError)
			return
		}

		if err := os.WriteFile("data/polyverse/cube-rules.json", data, 0644); err != nil {
			http.Error(rw, "could not save rules", http.StatusInternalServerError)
			return
		}

		rw.WriteHeader(http.StatusOK)
	})
}
