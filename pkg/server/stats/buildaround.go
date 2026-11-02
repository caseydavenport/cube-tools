package stats

import (
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// buildaroundShape matches cards whose effect keeps going: permanents that do
// more than enter, rebound spells, and lands with a recurring trigger. One-shot
// cards don't match.
var buildaroundShape = []string{
	`!t:instant !t:sorcery !t:land !o:"when ~ enters"`,
	`!t:instant !t:sorcery !t:land o:"when ~ enters" o:"whenever"`,
	`!t:instant !t:sorcery !t:land o:"when ~ enters" o:"at the beginning of your"`,
	`o:rebound`,
	`t:land !otag:fetchland o:"whenever"`,
	`t:land !otag:fetchland o:"at the beginning of your"`,
}

// buildaroundCards returns the build-arounds among cards: those matching
// buildaroundShape, the cards of groups marked buildaround, and every card a
// wire names with a card: entry. groupCards holds each group's cards.
func buildaroundCards(cards map[string]types.Card, config design.DesignMapConfig, groupCards map[string]map[string]bool) map[string]bool {
	out := map[string]bool{}
	for _, cond := range buildaroundShape {
		for name := range matchCards(cards, cond) {
			out[name] = true
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
			for _, entry := range append(append([]string{}, w.Sources...), w.Targets...) {
				if name, ok := strings.CutPrefix(entry, "card:"); ok {
					out[name] = true
				}
			}
		}
	}
	return out
}
