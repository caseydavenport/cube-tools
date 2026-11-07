package search

import (
	"errors"
	"fmt"
	"strings"
)

// node is one piece of a parsed query. A node can be judged against a single
// card or against a whole deck; deck judging follows the clause rules in
// matchDeck.
type node interface {
	matchCard(c Card) bool
	matchDeck(d deckSubject) bool

	// hasDeckTerm reports whether a deck keyword appears at or below the node.
	hasDeckTerm() bool

	// String rebuilds the node's query text, so a check can name the part of
	// a condition that passed or failed.
	String() string
}

// parser is a recursive-descent parser over a token list. The grammar is:
//
//	expr    = andExpr ("or" andExpr)*
//	andExpr = unary ("and"? unary)*
//	unary   = "-" unary | primary
//	primary = "(" expr ")" | "face:(" expr ")" | term
type parser struct {
	tokens []token
	pos    int
	target Target
}

// parse parses a whole query for the target.
func parse(q string, target Target) (node, error) {
	tokens, err := lex(q)
	if err != nil {
		return nil, err
	}
	if len(tokens) == 0 {
		return nil, nil
	}
	p := &parser{tokens: tokens, target: target}
	n, err := p.expr()
	if err != nil {
		return nil, err
	}
	if p.pos < len(p.tokens) {
		return nil, errors.New("unmatched )")
	}
	return n, nil
}

// peek returns the next token's kind, or -1 at the end.
func (p *parser) peek() tokenKind {
	if p.pos >= len(p.tokens) {
		return -1
	}
	return p.tokens[p.pos].kind
}

func (p *parser) expr() (node, error) {
	first, err := p.andExpr()
	if err != nil {
		return nil, err
	}
	children := []node{first}
	for p.peek() == tokenOr {
		p.pos++
		next, err := p.andExpr()
		if err != nil {
			return nil, err
		}
		children = append(children, next)
	}
	if len(children) == 1 {
		return first, nil
	}
	return &orNode{children: children}, nil
}

func (p *parser) andExpr() (node, error) {
	var children []node
	for {
		kind := p.peek()
		if kind == -1 || kind == tokenClose || kind == tokenOr {
			break
		}
		if kind == tokenAnd {
			p.pos++
			continue
		}
		next, err := p.unary()
		if err != nil {
			return nil, err
		}
		children = append(children, next)
	}
	switch len(children) {
	case 0:
		return nil, errors.New("expected a search term")
	case 1:
		return children[0], nil
	}
	return &andNode{children: children}, nil
}

func (p *parser) unary() (node, error) {
	if p.peek() != tokenNot {
		return p.primary()
	}
	p.pos++
	child, err := p.unary()
	if err != nil {
		return nil, err
	}
	return &notNode{child: child}, nil
}

func (p *parser) primary() (node, error) {
	tok := p.tokens[p.pos]
	p.pos++
	switch tok.kind {
	case tokenOpen:
		inner, err := p.group()
		if err != nil {
			return nil, err
		}
		return &groupNode{child: inner}, nil
	case tokenTerm:
		if tok.key == "face" && tok.value == "" && p.peek() == tokenOpen {
			p.pos++
			inner, err := p.group()
			if err != nil {
				return nil, err
			}
			return &faceNode{child: inner}, nil
		}
		return newTerm(tok, p.target)
	}
	return nil, fmt.Errorf("unexpected %s", tokenText(tok))
}

// group parses an expression up to its closing parenthesis.
func (p *parser) group() (node, error) {
	inner, err := p.expr()
	if err != nil {
		return nil, err
	}
	if p.peek() != tokenClose {
		return nil, errors.New("missing )")
	}
	p.pos++
	return inner, nil
}

// tokenText names a token in an error message.
func tokenText(tok token) string {
	switch tok.kind {
	case tokenClose:
		return ")"
	case tokenOr:
		return "or"
	case tokenAnd:
		return "and"
	}
	return "token"
}

// andNode matches when every child does.
type andNode struct {
	children []node
}

func (n *andNode) matchCard(c Card) bool {
	for _, child := range n.children {
		if !child.matchCard(c) {
			return false
		}
	}
	return true
}

func (n *andNode) matchDeck(d deckSubject) bool {
	for _, child := range n.children {
		if !child.matchDeck(d) {
			return false
		}
	}
	return true
}

func (n *andNode) hasDeckTerm() bool {
	return anyDeckTerm(n.children)
}

// String joins the children with spaces.
func (n *andNode) String() string {
	return joinNodes(n.children, " ")
}

// orNode matches when any child does.
type orNode struct {
	children []node
}

func (n *orNode) matchCard(c Card) bool {
	for _, child := range n.children {
		if child.matchCard(c) {
			return true
		}
	}
	return false
}

func (n *orNode) matchDeck(d deckSubject) bool {
	for _, child := range n.children {
		if child.matchDeck(d) {
			return true
		}
	}
	return false
}

func (n *orNode) hasDeckTerm() bool {
	return anyDeckTerm(n.children)
}

// String joins the children with "or", in parentheses.
func (n *orNode) String() string {
	return "(" + joinNodes(n.children, " or ") + ")"
}

// notNode negates its child. On a deck, -t:creature means no card is a
// creature, not that some card isn't one.
type notNode struct {
	child node
}

func (n *notNode) matchCard(c Card) bool {
	return !n.child.matchCard(c)
}

func (n *notNode) matchDeck(d deckSubject) bool {
	return !n.child.matchDeck(d)
}

func (n *notNode) hasDeckTerm() bool {
	return n.child.hasDeckTerm()
}

// String is the child with a leading -.
func (n *notNode) String() string {
	return "-" + n.child.String()
}

// groupNode is a parenthesized expression. On a card it changes nothing. On
// a deck, a group of card terms is one clause that a single card must meet.
type groupNode struct {
	child node
}

func (n *groupNode) matchCard(c Card) bool {
	return n.child.matchCard(c)
}

func (n *groupNode) matchDeck(d deckSubject) bool {
	if n.child.hasDeckTerm() {
		return n.child.matchDeck(d)
	}
	return d.anyCard(n.child.matchCard)
}

func (n *groupNode) hasDeckTerm() bool {
	return n.child.hasDeckTerm()
}

// String is the child in parentheses, without doubling them.
func (n *groupNode) String() string {
	inner := n.child.String()
	if strings.HasPrefix(inner, "(") {
		return inner
	}
	return "(" + inner + ")"
}

// faceNode matches a card when any face it can cast on its own matches, so
// a split or adventure card is judged by each half. A card without such faces
// is judged whole.
type faceNode struct {
	child node
}

func (n *faceNode) matchCard(c Card) bool {
	if len(c.Faces) == 0 {
		return n.child.matchCard(c)
	}
	for _, f := range c.Faces {
		if n.child.matchCard(Card{Card: f, Stats: c.Stats}) {
			return true
		}
	}
	return false
}

func (n *faceNode) matchDeck(d deckSubject) bool {
	return d.anyCard(n.matchCard)
}

func (n *faceNode) hasDeckTerm() bool {
	return false
}

// String is the child wrapped in face:( ).
func (n *faceNode) String() string {
	inner := n.child.String()
	if strings.HasPrefix(inner, "(") {
		return "face:" + inner
	}
	return "face:(" + inner + ")"
}

// anyDeckTerm reports whether any of nodes holds a deck keyword.
func anyDeckTerm(nodes []node) bool {
	for _, n := range nodes {
		if n.hasDeckTerm() {
			return true
		}
	}
	return false
}

// joinNodes joins the nodes' query text with sep.
func joinNodes(nodes []node, sep string) string {
	parts := make([]string, 0, len(nodes))
	for _, n := range nodes {
		parts = append(parts, n.String())
	}
	return strings.Join(parts, sep)
}
