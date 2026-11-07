package search

import (
	"slices"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// selfWords are the words oracle text uses after "this" to mean the card
// itself.
var selfWords = []string{
	"creature",
	"artifact",
	"enchantment",
	"equipment",
	"aura",
	"vehicle",
	"land",
	"saga",
	"permanent",
	"planeswalker",
	"battle",
	"spell",
	"card",
	"class",
	"case",
	"room",
}

// selfText is the card's lowercased oracle text with every reference to the
// card itself replaced by "~", as Scryfall's ~ search does: its full name,
// each face's name, a legend's short name before the comma, and "this
// creature" and the like.
func selfText(card types.Card) string {
	text := strings.ToLower(card.OracleText)
	var names []string
	for _, face := range strings.Split(card.Name, "//") {
		name := strings.ToLower(strings.TrimSpace(face))
		names = append(names, name)
		if short, _, ok := strings.Cut(name, ","); ok {
			names = append(names, short)
		}
	}

	// Longer names go first so a short name doesn't split a full one.
	slices.SortFunc(names, func(a, b string) int { return len(b) - len(a) })
	for _, name := range names {
		if name != "" {
			text = strings.ReplaceAll(text, name, "~")
		}
	}
	for _, word := range selfWords {
		text = strings.ReplaceAll(text, "this "+word, "~")
	}
	return text
}
