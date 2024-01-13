package types

import "strings"

// Basic representation of a card.
type Card struct {
	Name       string   `json:"name"`
	Types      []string `json:"types,omitempty"`
	SubTypes   []string `json:"sub_types,omitempty"`
	CMC        int      `json:"cmc"`
	Image      string   `json:"image"`
	Colors     []string `json:"colors"`
	ManaCost   string   `json:"mana_cost"`
	URL        string   `json:"url"`
	OracleText string   `json:"oracle_text"`
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
	c.URL = o.ScryfallURI
	c.OracleText = o.OracleText
	c.ManaCost = o.ManaCost

	return c
}
