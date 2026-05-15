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
	Types         []string `json:"types,omitempty"`
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

// oraclePattern is either a case-insensitive substring or a pre-compiled
// regex. Use sub() for plain phrases, rx() when you need anchoring or
// alternation - e.g. requiring that "deals damage equal to" is followed by
// "to target creature" rather than "to each opponent".
type oraclePattern struct {
	substr string
	regex  *regexp.Regexp
}

func (p oraclePattern) match(text string) bool {
	if p.regex != nil {
		return p.regex.MatchString(text)
	}
	return strings.Contains(text, p.substr)
}

func sub(s string) oraclePattern { return oraclePattern{substr: strings.ToLower(s)} }
func rx(s string) oraclePattern  { return oraclePattern{regex: regexp.MustCompile("(?i)" + s)} }

func anyPattern(text string, patterns []oraclePattern) bool {
	lower := strings.ToLower(text)
	for _, p := range patterns {
		if p.match(lower) {
			return true
		}
	}
	return false
}

var removalPatterns = []oraclePattern{
	sub("Destroy target creature"),
	sub("Destroy target artifact"),
	sub("Destroy target enchantment"),
	sub("Destroy target land"),
	sub("Destroy target permanent"),
	sub("Destroy all creatures"),
	sub("Destroy all artifacts"),
	sub("Destroy all enchantments"),
	sub("Destroy all lands"),
	sub("Destroy all permanents"),
	sub("Destroy each nonland permanent"),
	sub("Exile target creature"),
	sub("Exile target tapped creature"),
	sub("Exile target attacking creature"),
	sub("Exile target blocking creature"),
	sub("Exile target artifact"),
	sub("Exile target enchantment"),
	sub("Exile target land"),
	sub("Exile target permanent"),
	sub("Exile target nonland permanent"),
	sub("Exile up to one target"),
	sub("Exile up to one other"),
	sub("Exile all creatures"),
	sub("Exile all artifacts"),
	sub("Exile all enchantments"),
	sub("Exile all lands"),
	sub("Exile all permanents"),
	sub("Exile all nonland permanents"),
	sub("into its owner's library"),
	sub("is dealt to any target instead"),
	sub("Tap target creature"),
	sub("Target creature gets -"),
	sub("All creatures get -"),
	sub("Other creatures get -"),
	sub("damage to target creature"),
	sub("damage to target attacking creature"),
	sub("damage to target blocking creature"),
	sub("damage to target attacking or blocking creature"),
	sub("damage to target planeswalker"),
	sub("damage to any target"),
	sub("damage divided as you choose"),
	sub("each opponent sacrifices"),
	sub("each player sacrifices"),
	sub("target opponent sacrifices"),
	sub("target player sacrifices"),
	sub("return target creature to its owner's hand"),
	sub("return target nonland permanent to its owner's hand"),
	sub("fights target creature"),
	// "deals damage equal to" only counts as removal when the target is a
	// creature, planeswalker, or "any target" - "to each opponent" (Heartfire
	// Hero, burn-to-face triggers) is not removal.
	rx(`deals damage equal to [^.]*? to (target (creature|planeswalker)|any target)`),
	sub("put a stun counter on"),
}

func (c Card) IsRemoval() bool {
	return anyPattern(c.OracleText, removalPatterns)
}

var counterspellPatterns = []oraclePattern{
	sub("Counter target spell"),
	sub("Counter target creature spell"),
	sub("Counter target noncreature spell"),
	sub("Counter target artifact spell"),
	sub("Counter target enchantment spell"),
	sub("Counter target instant spell"),
	sub("Counter target sorcery spell"),
	sub("Counter target planeswalker spell"),
	sub("Return target spell to its owner's hand"),
	sub("Exile target spell"),
}

func (c Card) IsCounterspell() bool {
	return anyPattern(c.OracleText, counterspellPatterns)
}

var handHatePatterns = []oraclePattern{
	sub("Target player reveals their hand"),
	sub("Target opponent reveals their hand"),
	sub("Target player discards "),
	sub("Target opponent discards "),
	sub("Each opponent discards "),
	sub("Each player discards a card"),
}

func (c Card) IsHandHate() bool {
	return anyPattern(c.OracleText, handHatePatterns)
}

func (c Card) IsInteraction() bool {
	return c.IsRemoval() || c.IsCounterspell() || c.IsHandHate()
}

func FromOracle(o OracleCard) Card {
	c := Card{Name: o.Name}
	c.CMC = int(o.CMC)
	c.Image = o.ImageURLs["normal"]
	c.ColorIdentity = o.ColorIdentity
	c.URL = o.ScryfallURI
	c.Power = o.Power
	c.Toughness = o.Toughness

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
