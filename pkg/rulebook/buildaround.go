package rulebook

import (
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// buildaroundShape matches cards whose effect keeps going: permanents that do
// more than enter, rebound spells, and lands with a recurring trigger. One-shot
// cards don't match.
var buildaroundShape = []string{
	`-t:instant -t:sorcery -t:land -o:"when ~ enters"`,
	`-t:instant -t:sorcery -t:land o:"when ~ enters" o:"whenever"`,
	`-t:instant -t:sorcery -t:land o:"when ~ enters" o:"at the beginning of your"`,
	`o:rebound`,
	`t:land -otag:fetchland o:"whenever"`,
	`t:land -otag:fetchland o:"at the beginning of your"`,
}

// buildaroundShapeGroup is buildaroundShape as one group, so its matches are
// remembered alongside the rules'.
var buildaroundShapeGroup = []design.Group{{Name: "Build-around shape", Conditions: buildaroundShape}}

// buildaroundCards returns the build-arounds among cards: those matching
// buildaroundShape outside groups marked notBuildaround, the cards of groups
// marked buildaround, and every card a wire names with a card: entry.
// groupCards holds each group's cards.
func buildaroundCards(cards map[string]types.Card, config design.DesignMapConfig, groupCards map[string]map[string]bool) map[string]bool {
	out := map[string]bool{}
	shape := NewMatcher(buildaroundShapeGroup)
	for name, card := range cards {
		if len(shape.Match(card)) > 0 {
			out[name] = true
		}
	}
	for _, g := range config.Groups {
		if !g.NotBuildaround {
			continue
		}
		for name := range groupCards[g.Name] {
			delete(out, name)
		}
	}
	for _, g := range config.Groups {
		if !g.Buildaround {
			continue
		}
		for name := range groupCards[g.Name] {
			out[name] = true
		}
	}
	for _, p := range config.Packages {
		for _, w := range p.Wires {
			for _, entry := range slices.Concat(w.Sources, w.Targets) {
				if name := design.CardRefName(entry); name != "" {
					out[name] = true
				}
			}
		}
	}
	return out
}
