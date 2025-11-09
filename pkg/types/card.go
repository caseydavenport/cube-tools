package types

import (
	"slices"
	"strings"
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

	// Parse the type line.
	splits := strings.Split(o.TypeLine, "—")
	c.Types = strings.Split(strings.TrimSpace(splits[0]), " ")

	if len(splits) > 1 {
		c.SubTypes = strings.Split(strings.TrimSpace(splits[1]), " ")
	}

	c.Image = o.ImageURLs["normal"]
	c.Colors = o.Colors
	c.ColorIdentity = o.ColorIdentity
	c.URL = o.ScryfallURI
	c.OracleText = o.OracleText
	c.ManaCost = o.ManaCost
	c.Power = o.Power
	c.Toughness = o.Toughness

	return c
}

func (c Card) IsColor(color string) bool {
	if color == "" {
		return true
	}
	for _, col := range c.Colors {
		if stringContains(color, col) {
			return true
		}
	}
	return false
}

func stringContains(str, substr string) bool {
	return strings.Contains(strings.ToLower(str), strings.ToLower(substr))
}
