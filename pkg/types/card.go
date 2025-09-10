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

	// Determined based on replay data - how many times this card
	// has appeared in a game. Either in hand, graveyard, battlefield, etc.
	Appearances int `json:"appearances,omitempty"`
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
		"Exile target creature",
		"Exile target artifact",
		"Exile target enchantment",
		"Exile target land",
		"Exile target permanent",
		"Exile all creatures",
		"Exile all artifacts",
		"Exile all enchantments",
		"Exile all lands",
		"Exile all permanents",
	}
	for _, r := range removal {
		if strings.Contains(c.OracleText, r) {
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
	}
	for _, cs := range counterspells {
		if strings.Contains(c.OracleText, cs) {
			return true
		}
	}
	return false
}

func (c Card) IsInteraction() bool {
	return c.IsRemoval() || c.IsCounterspell()
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
		if strings.Contains(color, col) {
			return true
		}
	}
	return false
}
