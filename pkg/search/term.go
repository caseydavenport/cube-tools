package search

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// term is one keyword test, or a bare word, with its value already checked
// and read into the form its keyword compares.
type term struct {
	kw    *Keyword
	op    string
	value string

	// lower is a text value in lower case, and pattern the same value with *
	// read as a wildcard; a nil pattern means a plain contains check.
	lower   string
	pattern *regexp.Regexp

	// tagSlug is an otag: value resolved to its tag's slug when the query
	// compiles; empty when no tag has that name, so the term matches nothing.
	tagSlug string

	num    float64
	colors colorSet

	// bare marks a bare word, exact a !name.
	bare  bool
	exact bool
}

// newTerm checks a term token against the keyword table and the target, and
// reads its value. A != on a text or choice keyword becomes a negated :.
func newTerm(tok token, target Target) (node, error) {
	parsed := &term{op: tok.op, value: tok.value, exact: tok.exact}

	// A bare word or exact name has no keyword to check.
	if tok.key == "" {
		parsed.bare = !tok.exact
		if parsed.value == "" {
			return nil, errors.New("empty search term")
		}
		parsed.setPattern()
		return &termNode{term: parsed, target: target}, nil
	}

	keyword, ok := keywordsByName[tok.key]
	if !ok {
		return nil, fmt.Errorf("unknown keyword %s%s", tok.key, tok.op)
	}
	if !target.allows(keyword.Scope) {
		return nil, fmt.Errorf("%s%s %s", tok.key, tok.op, target.refusal(keyword.Scope))
	}
	if !slices.Contains(operatorsFor(keyword.Kind), tok.op) {
		return nil, fmt.Errorf("%s doesn't take %s", tok.key, tok.op)
	}
	parsed.kw = keyword

	if err := parsed.read(tok); err != nil {
		return nil, err
	}

	// != on text is a negated :, since a contains check has no "not equal".
	n := node(&termNode{term: parsed, target: target})
	if parsed.op == "!=" && (keyword.Kind == ValueText || keyword.Kind == ValueChoice) {
		parsed.op = ":"
		n = &notNode{child: n}
	}
	return n, nil
}

// read reads the term's value for its keyword's kind.
func (t *term) read(tok token) error {
	switch t.kw.Kind {
	case ValueNumber:
		n, err := strconv.ParseFloat(t.value, 64)
		if err != nil {
			return fmt.Errorf("%s needs a number, not %q", tok.key, t.value)
		}
		t.num = n
	case ValueColor:
		set, err := parseColors(t.value)
		if err != nil {
			return fmt.Errorf("%s%s%s: %w", tok.key, tok.op, t.value, err)
		}
		t.colors = set
	case ValueChoice:
		t.value = strings.ToLower(t.value)
		if !slices.Contains(t.kw.Values, t.value) {
			return fmt.Errorf("%s: takes one of %s", tok.key, strings.Join(t.kw.Values, ", "))
		}
	case ValueText:
		if t.value == "" && t.kw.Name != "package" {
			return fmt.Errorf("%s%s needs a value", tok.key, tok.op)
		}
		t.setPattern()
		if t.kw.Name == "otag" {
			if tag, ok := types.LookupOracleTag(t.value); ok {
				t.tagSlug = tag.Slug
			}
		}
	}
	return nil
}

// setPattern lowercases a text value once, and compiles one containing * into
// a wildcard pattern.
func (t *term) setPattern() {
	t.lower = strings.ToLower(t.value)
	if !strings.Contains(t.lower, "*") {
		return
	}
	expr := strings.ReplaceAll(regexp.QuoteMeta(t.lower), `\*`, ".*")
	t.pattern = regexp.MustCompile(expr)
}

// text reports whether lowered text holds the term's value: contains for :,
// whole for =.
func (t *term) text(lowered string) bool {
	if t.op == "=" {
		return lowered == t.lower
	}
	if t.pattern != nil {
		return t.pattern.MatchString(lowered)
	}
	return strings.Contains(lowered, t.lower)
}

// anyText reports whether any of values holds the term's value.
func (t *term) anyText(values []string) bool {
	return slices.ContainsFunc(values, func(v string) bool { return t.text(strings.ToLower(v)) })
}

// number compares n against the term's value with its operator; : means =.
func (t *term) number(n float64) bool {
	switch t.op {
	case "<":
		return n < t.num
	case "<=":
		return n <= t.num
	case ">":
		return n > t.num
	case ">=":
		return n >= t.num
	case "!=":
		return n != t.num
	}
	return n == t.num
}

// termNode is a term in the parsed tree.
type termNode struct {
	term   *term
	target Target
}

func (n *termNode) matchCard(c Card) bool {
	t := n.term
	switch {
	case t.exact:
		return strings.EqualFold(c.Name, t.value)
	case t.bare:
		return t.text(c.lowerName())
	case t.kw.matchCard == nil:
		return false
	}
	return t.kw.matchCard(c, t)
}

// matchDeck judges the term on a deck. A deck keyword reads the deck. A card
// term needs some card on the board to match. A bare word also matches the
// deck's player, an archetype label or its event.
func (n *termNode) matchDeck(d deckSubject) bool {
	t := n.term
	if t.kw != nil && t.kw.matchDeck != nil {
		return t.kw.matchDeck(d, t)
	}
	if t.bare && d.bareWordMatches(t) {
		return true
	}
	return d.anyCard(n.matchCard)
}

func (n *termNode) hasDeckTerm() bool {
	return n.term.kw != nil && n.term.kw.Scope == ScopeDeck
}

// String is the term in canonical form: the keyword's main name, with the
// value quoted when it holds a space.
func (n *termNode) String() string {
	t := n.term
	value := t.value
	if strings.ContainsAny(value, " ()") {
		value = `"` + value + `"`
	}
	switch {
	case t.exact:
		return "!" + value
	case t.bare:
		return value
	}
	return t.kw.Name + t.op + value
}
