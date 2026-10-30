package types

import (
	"regexp"
	"slices"
	"strings"

	"github.com/sirupsen/logrus"
)

// Basic representation of a card.
type Card struct {
	Name          string   `json:"name"`
	Types         []string `json:"types"`
	SubTypes      []string `json:"sub_types,omitempty"`
	CMC           int      `json:"cmc"`
	Image         string   `json:"image"`
	Colors        []string `json:"colors"`
	ColorIdentity []string `json:"color_identity"`
	ManaCost      string   `json:"mana_cost"`
	URL           string   `json:"url"`
	OracleText    string   `json:"oracle_text"`
	Power         string   `json:"power,omitempty"`
	Toughness     string   `json:"toughness,omitempty"`

	// DraftELO is Cube Cobra's global draft Elo - its pick-order rating across all
	// cubes, not a per-card stat we compute. It isn't in our oracle data, so
	// `index` pulls it from the cube export. Serves as the "reputation" axis
	// against our match Elo.
	DraftELO int `json:"draft_elo,omitempty"`

	// Tags are the cube owner's per-card tags from Cube Cobra (e.g. "🧬" for
	// signature build-around cards). They're curated metadata, distinct from
	// the oracle-text-derived classifications above, and `index` pulls them
	// from the cube export. Used as a filter dimension in the UI, not to drive
	// the IsRemoval/IsInteraction heuristics (tags drift out of sync).
	Tags []string `json:"tags,omitempty"`

	// OracleTags are Scryfall's community tags on the card's rules, with every
	// broader tag above them (see LoadOracleTags). They stay off the wire: a
	// card has a dozen, and the decks payload carries thousands of cards.
	OracleTags []string `json:"-"`

	// Roles are the OracleTags the code acts on, such as removal and
	// counterspell, sent so the browser can count them.
	Roles []string `json:"roles,omitempty"`
}

func (c Card) IsBasicLand() bool {
	return slices.Contains(c.Types, "Basic") && slices.Contains(c.Types, "Land")
}

func (c Card) IsLand() bool {
	return slices.Contains(c.Types, "Land")
}

func (c Card) IsCreature() bool {
	return slices.Contains(c.Types, "Creature")
}

func (c Card) IsHybrid() bool {
	return stringContains(c.ManaCost, "/")
}

// manaSymbolPattern pulls each {...} symbol out of a Scryfall mana cost.
var manaSymbolPattern = regexp.MustCompile(`\{[^}]+\}`)

// ColorPips counts the colored mana symbols in the card's cost, keyed by color.
// Hybrid and Phyrexian symbols count toward every color they name, so {G/W} adds
// a pip to both G and W and {B/P} adds one to B. Generic, colorless, and {X}
// symbols contribute nothing.
func (c Card) ColorPips() map[string]int {
	pips := map[string]int{}
	for _, sym := range manaSymbolPattern.FindAllString(c.ManaCost, -1) {
		// Strip the braces, then split hybrid/Phyrexian symbols on "/".
		for _, part := range strings.Split(sym[1:len(sym)-1], "/") {
			switch part {
			case "W", "U", "B", "R", "G":
				pips[part]++
			}
		}
	}
	return pips
}

func FromOracle(o OracleCard) Card {
	c := Card{Name: o.Name}
	c.CMC = int(o.CMC)
	c.Image = o.ImageURLs["normal"]
	c.ColorIdentity = o.ColorIdentity
	c.URL = o.ScryfallURI
	c.Power = o.Power
	c.Toughness = o.Toughness
	c.OracleTags = OracleTagsFor(o.OracleID)
	c.Roles = rolesIn(c.OracleTags)

	// Parse the type line. For multi-face cards (split, transform, modal_dfc,
	// adventure, flip) Scryfall joins both faces with " // ". Split on that
	// first so each half is parsed independently and the result is the union
	// of types across faces - this is what lets IsLand() see the back of an
	// MDFC like Witch Enchanter // Witch-Blessed Meadow.
	c.Types, c.SubTypes = parseTypeLine(o.TypeLine)

	// Top-level Colors / ManaCost / OracleText / Power / Toughness are empty
	// for transform and modal_dfc layouts. Fall back to the face-level data
	// when that happens so color stats, hybrid detection, and text matching
	// still work.
	c.Colors = o.Colors
	c.ManaCost = o.ManaCost
	c.OracleText = o.OracleText
	if len(o.CardFaces) > 0 {
		// Transform and modal_dfc layouts carry no top-level image; the art
		// lives on each face. Use the front face so DFCs like flip sagas still
		// get a picture.
		if c.Image == "" {
			c.Image = o.CardFaces[0].ImageURLs["normal"]
		}
		if len(c.Colors) == 0 {
			c.Colors = unionFaceColors(o.CardFaces)
		}
		if c.ManaCost == "" {
			var costs []string
			for _, face := range o.CardFaces {
				if face.ManaCost != "" {
					costs = append(costs, face.ManaCost)
				}
			}
			c.ManaCost = strings.Join(costs, " // ")
		}
		if c.OracleText == "" {
			var texts []string
			for _, face := range o.CardFaces {
				if face.OracleText != "" {
					texts = append(texts, face.OracleText)
				}
			}
			c.OracleText = strings.Join(texts, "\n")
		}
		if c.Power == "" {
			c.Power = o.CardFaces[0].Power
		}
		if c.Toughness == "" {
			c.Toughness = o.CardFaces[0].Toughness
		}
	}

	return withLists(c)
}

// withLists replaces missing types, colors and color identity with empty
// lists, so the JSON the UI reads always has them. Card has no MarshalJSON for
// this, because structs that embed Card would inherit it and lose their own
// fields.
func withLists(c Card) Card {
	for _, list := range []*[]string{&c.Types, &c.Colors, &c.ColorIdentity} {
		if *list == nil {
			*list = []string{}
		}
	}
	return c
}

// parseTypeLine splits a Scryfall type_line into (types, subtypes), handling
// multi-face cards by treating " // " as a face separator and unioning across
// faces.
func parseTypeLine(line string) ([]string, []string) {
	var types, subs []string
	seen := map[string]bool{}
	subSeen := map[string]bool{}
	for _, face := range strings.Split(line, "//") {
		parts := strings.SplitN(face, "—", 2)
		for _, t := range strings.Fields(parts[0]) {
			if !seen[t] {
				seen[t] = true
				types = append(types, t)
			}
		}
		if len(parts) > 1 {
			for _, s := range strings.Fields(parts[1]) {
				if !subSeen[s] {
					subSeen[s] = true
					subs = append(subs, s)
				}
			}
		}
	}
	return types, subs
}

func unionFaceColors(faces []OracleCardFace) []string {
	var out []string
	seen := map[string]bool{}
	for _, face := range faces {
		for _, c := range face.Colors {
			if !seen[c] {
				seen[c] = true
				out = append(out, c)
			}
		}
	}
	return out
}

// MatchesColor reports whether this card shares any color with the given
// filter string, where the filter is a concatenation of color letters (e.g.
// "W", "WU", "WUBRG"). An empty filter matches every card.
func (c Card) MatchesColor(color string) bool {
	if color == "" {
		return true
	}
	for _, col := range c.Colors {
		if col == "" {
			logrus.WithField("card", c.Name).Warn("Card has empty string in Colors; skipping entry")
			continue
		}
		if stringContains(color, col) {
			return true
		}
	}
	return false
}

var reminderTextRe = regexp.MustCompile(`\([^)]*\)`)

// WordCount returns the number of words in the card's oracle text,
// excluding reminder text (parenthesized).
func (c Card) WordCount() int {
	text := reminderTextRe.ReplaceAllString(c.OracleText, "")
	count := 0
	for _, w := range strings.Fields(text) {
		if w != "" {
			count++
		}
	}
	return count
}

func stringContains(str, substr string) bool {
	return strings.Contains(strings.ToLower(str), strings.ToLower(substr))
}
