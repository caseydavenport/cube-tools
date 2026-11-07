package search

import (
	"slices"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Scope says what a keyword describes: a card, a card's play stats on the
// Cards page, or a deck.
type Scope string

const (
	ScopeCard Scope = "card"
	ScopeStat Scope = "stat"
	ScopeDeck Scope = "deck"
)

// ValueKind is the kind of value a keyword takes, which decides its
// operators and how a value is read.
type ValueKind string

const (
	ValueText   ValueKind = "text"
	ValueNumber ValueKind = "number"
	ValueColor  ValueKind = "color"
	ValueChoice ValueKind = "choice"
)

// Keyword is one search keyword: its names, what it describes, and the
// help text the search bar shows. The same table drives parsing, the
// autocomplete and the help popover.
type Keyword struct {
	Name        string    `json:"name"`
	Aliases     []string  `json:"aliases,omitempty"`
	Scope       Scope     `json:"scope"`
	Kind        ValueKind `json:"kind"`
	Description string    `json:"description"`
	Example     string    `json:"example"`

	// Values are the choices for a choice keyword, or common values to
	// suggest for another kind.
	Values []string `json:"values,omitempty"`

	matchCard func(c Card, t *term) bool
	matchDeck func(d deckSubject, t *term) bool
}

// operatorsFor lists the operators a value kind accepts.
func operatorsFor(kind ValueKind) []string {
	switch kind {
	case ValueNumber, ValueColor:
		return []string{":", "=", "!=", "<", "<=", ">", ">="}
	}
	return []string{":", "=", "!="}
}

// isRoles are the is: choices, each a role the server classifies cards by.
var isRoles = map[string]func(types.Card) bool{
	"creature":     types.Card.IsCreature,
	"land":         types.Card.IsLand,
	"removal":      types.Card.IsRemoval,
	"counterspell": types.Card.IsCounterspell,
	"interaction":  types.Card.IsInteraction,
	"handhate":     types.Card.IsHandDisruption,
}

// popularities are the pop: choices, matching the Cards page's Popularity
// switch.
var popularities = []string{"popular", "typical", "niche"}

// keywords is every search keyword. Scryfall's names come first, with the
// older cube-tools spellings as aliases so saved links keep working.
var keywords = []*Keyword{
	{
		Name: "name", Aliases: []string{"n"}, Scope: ScopeCard, Kind: ValueText,
		Description: "Card name contains. A bare word does the same; !\"name\" is an exact name.",
		Example:     "name:bolt",
		matchCard:   func(c Card, t *term) bool { return t.text(strings.ToLower(c.Name)) },
	},
	{
		Name: "card", Scope: ScopeCard, Kind: ValueText,
		Description: "Exact card name, the same as !\"name\".",
		Example:     `card:"Lightning Bolt"`,
		matchCard:   func(c Card, t *term) bool { return strings.EqualFold(c.Name, t.value) },
	},
	{
		Name: "c", Aliases: []string{"color"}, Scope: ScopeCard, Kind: ValueColor,
		Description: "Card colors. c:ug is at least blue and green, c<=ug fits a blue-green deck, c=ug is exactly, c:m is multicolor and c:c colorless.",
		Example:     "c<=ug",
		Values:      []string{"w", "u", "b", "r", "g", "m", "c"},
		matchCard:   func(c Card, t *term) bool { return t.colors.compare(newColorSet(c.Colors), t.op) },
	},
	{
		Name: "t", Aliases: []string{"type"}, Scope: ScopeCard, Kind: ValueText,
		Description: "Card type or subtype contains.",
		Example:     "t:creature",
		Values:      []string{"artifact", "creature", "enchantment", "instant", "land", "planeswalker", "sorcery", "legendary"},
		matchCard:   func(c Card, t *term) bool { return t.anyText(c.Types) || t.anyText(c.SubTypes) },
	},
	{
		Name: "st", Aliases: []string{"subtype"}, Scope: ScopeCard, Kind: ValueText,
		Description: "Card subtype contains.",
		Example:     "st:zombie",
		matchCard:   func(c Card, t *term) bool { return t.anyText(c.SubTypes) },
	},
	{
		Name: "o", Aliases: []string{"oracle"}, Scope: ScopeCard, Kind: ValueText,
		Description: "Oracle text contains. ~ stands for the card's own name.",
		Example:     `o:"draw a card"`,
		matchCard:   matchOracle,
	},
	{
		Name: "m", Aliases: []string{"mana"}, Scope: ScopeCard, Kind: ValueText,
		Description: "Mana cost contains.",
		Example:     "m:{X}",
		matchCard:   func(c Card, t *term) bool { return t.text(strings.ToLower(c.ManaCost)) },
	},
	{
		Name: "mv", Aliases: []string{"cmc", "manavalue"}, Scope: ScopeCard, Kind: ValueNumber,
		Description: "Mana value.",
		Example:     "mv<=2",
		matchCard:   func(c Card, t *term) bool { return t.number(float64(c.CMC)) },
	},
	{
		Name: "pow", Aliases: []string{"power"}, Scope: ScopeCard, Kind: ValueNumber,
		Description: "Power.",
		Example:     "pow>=4",
		matchCard:   func(c Card, t *term) bool { return t.numberText(c.Power) },
	},
	{
		Name: "tou", Aliases: []string{"toughness"}, Scope: ScopeCard, Kind: ValueNumber,
		Description: "Toughness.",
		Example:     "tou<=2",
		matchCard:   func(c Card, t *term) bool { return t.numberText(c.Toughness) },
	},
	{
		Name: "is", Scope: ScopeCard, Kind: ValueChoice,
		Description: "A role the server classifies cards by. Interaction is removal, counterspells and hand disruption.",
		Example:     "is:interaction",
		Values:      []string{"creature", "land", "removal", "counterspell", "interaction", "handhate"},
		matchCard:   func(c Card, t *term) bool { return isRoles[t.value](c.Card) },
	},
	{
		Name: "otag", Aliases: []string{"function", "oracletag"}, Scope: ScopeCard, Kind: ValueText,
		Description: "Scryfall oracle tag, by slug or name.",
		Example:     "otag:removal",
		matchCard:   func(c Card, t *term) bool { return c.HasTag(t.value) },
	},
	{
		Name: "cctag", Scope: ScopeCard, Kind: ValueText,
		Description: "Cube Cobra tag, set by the cube's owner.",
		Example:     "cctag:watch",
		matchCard: func(c Card, t *term) bool {
			return slices.ContainsFunc(c.Tags, func(tag string) bool { return strings.EqualFold(tag, t.value) })
		},
	},
	{
		Name: "games", Scope: ScopeStat, Kind: ValueNumber,
		Description: "Games the card was played in.",
		Example:     "games>10",
		matchCard:   statNumber(func(s *CardStats) float64 { return float64(s.Games) }),
	},
	{
		Name: "mb", Scope: ScopeStat, Kind: ValueNumber,
		Description: "Decks that mainboarded the card.",
		Example:     "mb>0",
		matchCard:   statNumber(func(s *CardStats) float64 { return float64(s.Mainboard) }),
	},
	{
		Name: "sb", Scope: ScopeStat, Kind: ValueNumber,
		Description: "Decks that sideboarded the card.",
		Example:     "sb>0",
		matchCard:   statNumber(func(s *CardStats) float64 { return float64(s.Sideboard) }),
	},
	{
		Name: "players", Scope: ScopeStat, Kind: ValueNumber,
		Description: "Players who mainboarded the card.",
		Example:     "players>2",
		matchCard:   statNumber(func(s *CardStats) float64 { return float64(s.Players) }),
	},
	{
		Name: "drafts", Scope: ScopeStat, Kind: ValueNumber,
		Description: "Drafts the card was in.",
		Example:     "drafts>3",
		matchCard:   statNumber(func(s *CardStats) float64 { return float64(s.Drafts) }),
	},
	{
		Name: "winpct", Scope: ScopeStat, Kind: ValueNumber,
		Description: "Win percentage of the decks that played the card. Too noisy to judge a card by.",
		Example:     "winpct>50",
		matchCard:   statNumber(func(s *CardStats) float64 { return s.WinPct }),
	},
	{
		Name: "pop", Aliases: []string{"popularity"}, Scope: ScopeStat, Kind: ValueChoice,
		Description: "How often the card makes decks it was drafted into.",
		Example:     "pop:popular",
		Values:      popularities,
		matchCard:   func(c Card, t *term) bool { return c.Stats != nil && c.Stats.Popularity == t.value },
	},
	{
		Name: "arch", Aliases: []string{"archetype"}, Scope: ScopeDeck, Kind: ValueText,
		Description: "Deck archetype or tag.",
		Example:     "arch:aggro",
		matchDeck: func(d deckSubject, t *term) bool {
			return slices.ContainsFunc(d.deck.GetLabels(), func(l string) bool { return strings.EqualFold(l, t.value) })
		},
	},
	{
		Name: "player", Scope: ScopeDeck, Kind: ValueText,
		Description: "Player name, whole.",
		Example:     `player:"Joan Jett"`,
		matchDeck:   func(d deckSubject, t *term) bool { return strings.EqualFold(d.deck.GetPlayer(), t.value) },
	},
	{
		Name: "event", Scope: ScopeDeck, Kind: ValueText,
		Description: "Draft event code, name or flight contains.",
		Example:     "event:ccc2025",
		matchDeck:   func(d deckSubject, t *term) bool { return t.anyText(d.deck.GetEventTerms()) },
	},
	{
		Name: "dc", Aliases: []string{"dcolor", "deckcolor"}, Scope: ScopeDeck, Kind: ValueColor,
		Description: "Deck colors, compared like c:.",
		Example:     "dc=ub",
		Values:      []string{"w", "u", "b", "r", "g", "m", "c"},
		matchDeck:   func(d deckSubject, t *term) bool { return t.colors.compare(identitySet(d.deck.GetColors()), t.op) },
	},
	{
		Name: "draftsize", Scope: ScopeDeck, Kind: ValueNumber,
		Description: "Players in the deck's draft.",
		Example:     "draftsize>=6",
		matchDeck:   func(d deckSubject, t *term) bool { return t.number(float64(d.deck.GetDraftSize())) },
	},
	{
		Name: "package", Scope: ScopeDeck, Kind: ValueText,
		Description: "Builds a package: 2 or more cards on each side of one of its wires. A bare package: means any.",
		Example:     "package:graveyard",
		matchDeck:   func(d deckSubject, t *term) bool { return d.buildsPackage(t.value) },
	},
}

// keywordsByName maps every keyword name and alias to its keyword.
var keywordsByName = indexKeywords()

func indexKeywords() map[string]*Keyword {
	idx := make(map[string]*Keyword)
	for _, kw := range keywords {
		idx[kw.Name] = kw
		for _, alias := range kw.Aliases {
			idx[alias] = kw
		}
	}
	return idx
}

// Keywords returns the keywords a target accepts, for the search bar's
// autocomplete and help.
func Keywords(target Target) []Keyword {
	var out []Keyword
	for _, kw := range keywords {
		if target.allows(kw.Scope) {
			out = append(out, *kw)
		}
	}
	return out
}

// statNumber builds a play-stat keyword's matcher from the stat it reads. A
// card without stats never matches.
func statNumber(field func(*CardStats) float64) func(Card, *term) bool {
	return func(c Card, t *term) bool {
		return c.Stats != nil && t.number(field(c.Stats))
	}
}

// matchOracle matches oracle text, reading ~ as the card's own name.
func matchOracle(c Card, t *term) bool {
	if strings.Contains(t.value, "~") {
		return t.text(selfText(c.Card))
	}
	return t.text(strings.ToLower(c.OracleText))
}

// numberText compares a number stored as text, such as a power of "*",
// which never matches.
func (t *term) numberText(s string) bool {
	n, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return false
	}
	return t.number(n)
}
