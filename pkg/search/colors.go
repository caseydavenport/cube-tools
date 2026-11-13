package search

import (
	"errors"
	"strings"
)

// colorSet is a set of WUBRG colors as a bitmask. A query value can also be
// one of the special values, multicolor or colorless.
type colorSet struct {
	bits uint8

	// multicolor and colorless mark the c:m and c:c query values.
	multicolor bool
	colorless  bool
}

// colorBits maps each color letter to its bit.
var colorBits = map[rune]uint8{
	'w': 1,
	'u': 2,
	'b': 4,
	'r': 8,
	'g': 16,
}

// colorWords are color names a query may spell out.
var colorWords = map[string]string{
	"white":      "w",
	"blue":       "u",
	"black":      "b",
	"red":        "r",
	"green":      "g",
	"multicolor": "m",
	"colorless":  "c",
}

// parseColors reads a query color value: letters such as "ug", a color
// name, "m" for multicolor or "c" for colorless.
func parseColors(value string) (colorSet, error) {
	v := strings.ToLower(value)
	if word, ok := colorWords[v]; ok {
		v = word
	}
	switch v {
	case "m":
		return colorSet{multicolor: true}, nil
	case "c":
		return colorSet{colorless: true}, nil
	}
	var set colorSet
	for _, r := range v {
		bit, ok := colorBits[r]
		if !ok {
			return colorSet{}, errors.New("colors are letters from wubrg, or m or c")
		}
		set.bits |= bit
	}
	if set.bits == 0 {
		return colorSet{}, errors.New("needs a color")
	}
	return set, nil
}

// newColorSet builds the set of a card's colors.
func newColorSet(colors []string) colorSet {
	var set colorSet
	for _, c := range colors {
		for _, r := range strings.ToLower(c) {
			set.bits |= colorBits[r]
		}
	}
	return set
}

// count is how many colors the set holds.
func (s colorSet) count() int {
	n := 0
	for b := s.bits; b != 0; b &= b - 1 {
		n++
	}
	return n
}

// compare tests have, a card's or deck's colors, against the query set s
// with Scryfall's meanings: : and >= mean at least, = exactly, <= within,
// < and > strictly within or beyond, != not exactly.
func (s colorSet) compare(have colorSet, op string) bool {
	if s.multicolor || s.colorless {
		match := have.count() >= 2
		if s.colorless {
			match = have.bits == 0
		}
		if op == "!=" {
			return !match
		}
		return match
	}

	within := have.bits&^s.bits == 0
	covers := s.bits&^have.bits == 0
	switch op {
	case "=":
		return have.bits == s.bits
	case "!=":
		return have.bits != s.bits
	case "<=":
		return within
	case "<":
		return within && have.bits != s.bits
	case ">":
		return covers && have.bits != s.bits
	}
	return covers
}
