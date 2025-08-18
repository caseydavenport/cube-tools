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

	// Determined based on replay data - how many times this card
	// has appeared in a game. Either in hand, graveyard, battlefield, etc.
	Appearances int `json:"appearances,omitempty"`
}

func (c Card) IsBasicLand() bool {
	return slices.Contains(c.Types, "Basic") && slices.Contains(c.Types, "Land")
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

	return c
}
