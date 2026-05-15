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

func (c Card) IsRemoval() bool {
	removal := []string{
		"Destroy target creature",
		"Destroy target artifact",
		"Destroy target enchantment",
		"Destroy target land",
		"Destroy target permanent",
		"Destroy all creatures",
		"Destroy all artifacts",
		"Destroy all enchantments",
		"Destroy all lands",
		"Destroy all permanents",
		"Destroy each nonland permanent",
		"Exile target creature",
		"Exile target tapped creature",
		"Exile target attacking creature",
		"Exile target blocking creature",
		"Exile target artifact",
		"Exile target enchantment",
		"Exile target land",
		"Exile target permanent",
		"Exile target nonland permanent",
		"Exile up to one target",
		"Exile up to one other",
		"Exile all creatures",
		"Exile all artifacts",
		"Exile all enchantments",
		"Exile all lands",
		"Exile all permanents",
		"Exile all nonland permanents",
		"into its owner's library",
		"is dealt to any target instead",
		"Tap target creature",
		"Target creature gets -",
		"All creatures get -",
		"Other creatures get -",
		"damage to target creature",
		"damage to target attacking creature",
		"damage to target blocking creature",
		"damage to target attacking or blocking creature",
		"damage to target planeswalker",
		"damage to any target",
		"damage divided as you choose",
		"each opponent sacrifices",
		"each player sacrifices",
		"target opponent sacrifices",
		"target player sacrifices",
		"return target creature to its owner's hand",
		"return target nonland permanent to its owner's hand",
		"fights target creature",
		"deals damage equal to",
		"put a stun counter on",
	}
	for _, r := range removal {
		if stringContains(c.OracleText, r) {
			return true
		}
	}
	return false
}

func (c Card) IsCounterspell() bool {
	counterspells := []string{
		"Counter target spell",
		"Counter target creature spell",
		"Counter target noncreature spell",
		"Counter target artifact spell",
		"Counter target enchantment spell",
		"Counter target instant spell",
		"Counter target sorcery spell",
		"Counter target planeswalker spell",
		"Return target spell to its owner's hand",
		"Exile target spell",
	}
	for _, cs := range counterspells {
		if stringContains(c.OracleText, cs) {
			return true
		}
	}
	return false
}

func (c Card) IsHandHate() bool {
	handhate := []string{
		"Target player reveals their hand",
		"Target opponent reveals their hand",
		"Target player discards ",
		"Target opponent discards ",
		"Each opponent discards ",
		"Each player discards a card",
	}
	for _, hh := range handhate {
		if stringContains(c.OracleText, hh) {
			return true
		}
	}
	return false
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
