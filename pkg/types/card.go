package types

import (
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/sirupsen/logrus"
)

// Card is the basic representation of a card, in the JSON form the UI reads.
// FromOracle and HydrateCard build it from the oracle data.
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

	// DraftELO is Cube Cobra's global pick-order rating across all cubes, which
	// `index` pulls from the cube export. It is the "reputation" axis against
	// our match Elo.
	DraftELO int `json:"draft_elo,omitempty"`

	// Tags are the cube owner's Cube Cobra tags (e.g. "🧬" for build-arounds),
	// pulled in by `index`. The UI filters on them; no heuristic reads them
	// because they drift out of sync.
	Tags []string `json:"tags,omitempty"`

	// OracleTags are Scryfall's community tags on the card's rules, with every
	// broader tag above them (see LoadOracleTags). They stay off the wire: a
	// card has a dozen, and the decks payload carries thousands of cards.
	OracleTags []string `json:"-"`

	// Roles are the OracleTags the code acts on, such as removal and
	// counterspell, sent so the browser can count them.
	Roles []string `json:"roles,omitempty"`

	// Faces are the halves a player casts on their own: split halves, an
	// adventure card's two parts, a modal double-faced card's faces. Other
	// cards have none.
	Faces []Card `json:"-"`
}

// castableFaceLayouts are the Scryfall layouts whose faces are each cast on
// their own.
var castableFaceLayouts = map[string]bool{
	"split":     true,
	"adventure": true,
	"modal_dfc": true,
}

// IsBasicLand reports whether the card's types include both Basic and Land,
// which covers snow-covered basics.
func (c Card) IsBasicLand() bool {
	return slices.Contains(c.Types, "Basic") && slices.Contains(c.Types, "Land")
}

// IsLand reports whether any face of the card is a land, so a modal
// double-faced card with a land back counts.
func (c Card) IsLand() bool {
	return slices.Contains(c.Types, "Land")
}

// IsCreature reports whether any face of the card is a creature.
func (c Card) IsCreature() bool {
	return slices.Contains(c.Types, "Creature")
}

// IsHybrid reports whether the mana cost has a hybrid or Phyrexian symbol,
// such as {R/W} or {B/P}.
func (c Card) IsHybrid() bool {
	return strings.Contains(c.ManaCost, "/")
}

// manaSymbolPattern pulls each {...} symbol out of a Scryfall mana cost.
var manaSymbolPattern = regexp.MustCompile(`\{[^}]+\}`)

// ColorPips counts the colored mana symbols in the card's cost, keyed by color.
// Hybrid and Phyrexian symbols count toward every color they name, so {G/W} adds
// a pip to both G and W and {B/P} adds one to B. Generic, colorless, and {X}
// symbols contribute nothing.
func (c Card) ColorPips() map[string]int {
	numPips := map[string]int{}
	for _, sym := range manaSymbolPattern.FindAllString(c.ManaCost, -1) {
		// Strip the braces, then split hybrid/Phyrexian symbols on "/".
		for _, part := range strings.Split(sym[1:len(sym)-1], "/") {
			switch part {
			case "W", "U", "B", "R", "G":
				numPips[part]++
			}
		}
	}
	return numPips
}

// FromOracle builds a Card from Scryfall oracle data. It fills the top-level
// fields from the card's faces where Scryfall leaves them empty (transform and
// modal double-faced cards), and gives split, adventure and modal double-faced
// cards a Card per castable face in Faces.
func FromOracle(oracle OracleCard) Card {
	card := Card{Name: oracle.Name}
	card.CMC = int(oracle.CMC)
	card.Image = oracle.ImageURLs["normal"]
	card.ColorIdentity = oracle.ColorIdentity
	card.URL = oracle.ScryfallURI
	card.Power = oracle.Power
	card.Toughness = oracle.Toughness
	card.OracleTags = OracleTagsFor(oracle.OracleID)
	card.Roles = rolesIn(card.OracleTags)

	// Scryfall joins a multi-face card's faces with " // ". Parsing each half
	// on its own unions the types across faces, so IsLand() sees a modal
	// double-faced card's land back.
	card.Types, card.SubTypes = parseTypeLine(oracle.TypeLine)

	card.Colors = oracle.Colors
	card.ManaCost = oracle.ManaCost
	card.OracleText = oracle.OracleText
	if len(oracle.CardFaces) > 0 {
		fillFromFaces(&card, oracle)
	}

	return withLists(card)
}

// fillFromFaces fills the fields Scryfall leaves empty at the top level of a
// transform or modal double-faced card from its faces, so color stats, hybrid
// detection and text matching still work.
func fillFromFaces(card *Card, oracle OracleCard) {
	front := oracle.CardFaces[0]

	// The art lives on each face, so the front face supplies the picture.
	if card.Image == "" {
		card.Image = front.ImageURLs["normal"]
	}
	if len(card.Colors) == 0 {
		card.Colors = unionFaceColors(oracle.CardFaces)
	}
	if card.ManaCost == "" {
		card.ManaCost = joinFaceField(oracle.CardFaces, func(face OracleCardFace) string { return face.ManaCost }, " // ")
	}
	if card.OracleText == "" {
		card.OracleText = joinFaceField(oracle.CardFaces, func(face OracleCardFace) string { return face.OracleText }, "\n")
	}
	if card.Power == "" {
		card.Power = front.Power
	}
	if card.Toughness == "" {
		card.Toughness = front.Toughness
	}
	if castableFaceLayouts[oracle.Layout] {
		card.Faces = castableFaces(oracle, card.OracleTags)
	}
}

// joinFaceField joins the non-empty values field picks from each face.
func joinFaceField(faces []OracleCardFace, field func(OracleCardFace) string, separator string) string {
	var values []string
	for _, face := range faces {
		if value := field(face); value != "" {
			values = append(values, value)
		}
	}
	return strings.Join(values, separator)
}

// castableFaces builds a Card for each face of o, with the face's own types,
// cost and text. Faces share the whole card's oracle tags, which Scryfall
// gives per card, not per face.
func castableFaces(o OracleCard, tags []string) []Card {
	faces := make([]Card, 0, len(o.CardFaces))
	for _, f := range o.CardFaces {
		face := Card{
			Name:       f.Name,
			CMC:        manaValue(f.ManaCost),
			Colors:     f.Colors,
			ManaCost:   f.ManaCost,
			OracleText: f.OracleText,
			Power:      f.Power,
			Toughness:  f.Toughness,
			OracleTags: tags,
		}
		face.Types, face.SubTypes = parseTypeLine(f.TypeLine)
		faces = append(faces, withLists(face))
	}
	return faces
}

// manaValue is a mana cost's mana value: each number counts as itself, X as
// 0, a symbol like {2/W} as its number, and every other symbol, hybrid and
// Phyrexian included, as 1.
func manaValue(cost string) int {
	total := 0
	for _, sym := range manaSymbolPattern.FindAllString(cost, -1) {
		first := strings.Split(sym[1:len(sym)-1], "/")[0]
		if n, err := strconv.Atoi(first); err == nil {
			total += n
		} else if first != "X" && first != "Y" && first != "Z" {
			total++
		}
	}
	return total
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

// unionFaceColors returns the colors across all faces, each once, in order of
// first appearance.
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
	return len(strings.Fields(text))
}

// stringContains reports whether str contains substr, ignoring case.
func stringContains(str, substr string) bool {
	return strings.Contains(strings.ToLower(str), strings.ToLower(substr))
}
