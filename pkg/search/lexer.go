package search

import (
	"fmt"
	"strings"
	"unicode"
)

// tokenKind says what a token is to the parser.
type tokenKind int

const (
	tokenTerm tokenKind = iota
	tokenOpen
	tokenClose
	tokenOr
	tokenAnd
	tokenNot
)

// token is one lexed piece of a query. A term token carries its keyword,
// operator and value already split apart; a bare word has no keyword.
type token struct {
	kind tokenKind

	// key, op and value are a term's parts, as typed. key is empty for a bare
	// word or an exact name.
	key   string
	op    string
	value string

	// exact marks a !name term.
	exact bool
}

// operators are the term operators, two-character ones first so <= isn't
// read as <.
var operators = []string{"!=", "<=", ">=", ":", "=", "<", ">"}

// lex splits a query into tokens. Spaces separate terms, parentheses group,
// a leading - negates, "or" and "and" in any case are operators, and double
// quotes keep spaces inside a value.
func lex(q string) ([]token, error) {
	var tokens []token
	runes := []rune(q)
	pos := 0
	for pos < len(runes) {
		r := runes[pos]
		switch {
		case unicode.IsSpace(r):
			pos++
		case r == '(':
			tokens = append(tokens, token{kind: tokenOpen})
			pos++
		case r == ')':
			tokens = append(tokens, token{kind: tokenClose})
			pos++
		case r == '-' && pos+1 < len(runes) && !unicode.IsSpace(runes[pos+1]):
			tokens = append(tokens, token{kind: tokenNot})
			pos++
		default:
			word, next, err := readWord(runes, pos)
			if err != nil {
				return nil, err
			}
			pos = next
			tok, err := wordToken(word)
			if err != nil {
				return nil, err
			}
			tokens = append(tokens, tok)
		}
	}
	return tokens, nil
}

// readWord reads one word from start: up to a space or parenthesis outside
// quotes. It returns the word with its quotes and the index after it.
func readWord(runes []rune, start int) (string, int, error) {
	i := start
	inQuotes := false
	for i < len(runes) {
		r := runes[i]
		if r == '"' {
			inQuotes = !inQuotes
		} else if !inQuotes && (unicode.IsSpace(r) || r == '(' || r == ')') {
			break
		}
		i++
	}
	if inQuotes {
		return "", 0, fmt.Errorf("unclosed quote in %s", string(runes[start:]))
	}
	return string(runes[start:i]), i, nil
}

// wordToken turns a word into a token: an and/or operator, an exact name
// (!name), a keyword term (key, operator, value) or a bare word.
func wordToken(word string) (token, error) {
	switch strings.ToLower(word) {
	case "or":
		return token{kind: tokenOr}, nil
	case "and":
		return token{kind: tokenAnd}, nil
	}

	if rest, ok := strings.CutPrefix(word, "!"); ok {
		if key, _, _ := splitTerm(rest); key != "" {
			return token{}, fmt.Errorf("%s: use - to negate a term; ! marks an exact card name", word)
		}
		return token{kind: tokenTerm, value: unquote(rest), exact: true}, nil
	}

	key, op, value := splitTerm(word)
	if key == "" {
		return token{kind: tokenTerm, value: unquote(word)}, nil
	}
	return token{kind: tokenTerm, key: key, op: op, value: unquote(value)}, nil
}

// splitTerm splits a keyword term into keyword, operator and value. A word
// that doesn't start with letters followed by an operator is a bare word,
// and comes back with an empty keyword.
func splitTerm(word string) (string, string, string) {
	end := 0
	for end < len(word) && isKeyRune(rune(word[end])) {
		end++
	}
	if end == 0 {
		return "", "", word
	}
	for _, op := range operators {
		if strings.HasPrefix(word[end:], op) {
			return strings.ToLower(word[:end]), op, word[end+len(op):]
		}
	}
	return "", "", word
}

// isKeyRune reports whether r can appear in a keyword.
func isKeyRune(r rune) bool {
	return r < unicode.MaxASCII && (unicode.IsLetter(r) || r == '_')
}

// unquote drops the double quotes around a value or inside a bare word.
func unquote(s string) string {
	return strings.ReplaceAll(s, `"`, "")
}
