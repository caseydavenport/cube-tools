package stats

import (
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CardInteraction is how a card meets the cube's removal, as the Removal page
// counts it. For a creature, AnsweredBy names the spot removal that can kill
// it. For spot removal, Removal holds its rows, one per mode, with coverage
// over the cube's Creatures. A card can have both, or neither.
type CardInteraction struct {
	Creatures  int           `json:"creatures"`
	AnsweredBy []string      `json:"answered_by"`
	Removal    []RemovalCard `json:"removal"`
}

// cardInteraction works out a card's interaction with the cube's removal. The
// card needn't be in the cube: a creature from outside is checked against the
// cube's removal, and removal from outside against the cube's creatures.
func cardInteraction(c types.Card, cube *types.Cube) CardInteraction {
	var creatures []creatureInfo
	for _, cc := range cube.Cards {
		if cc.IsCreature() {
			creatures = append(creatures, toCreatureInfo(cc))
		}
	}
	spot, _, _ := cubeSpotRemoval(cube, creatures, nil, 0)

	out := CardInteraction{Creatures: len(creatures), AnsweredBy: []string{}, Removal: []RemovalCard{}}
	if c.IsCreature() {
		target := toCreatureInfo(c)
		for _, card := range spot {
			if card.kills(target) {
				out.AnsweredBy = append(out.AnsweredBy, card.name)
			}
		}
		slices.Sort(out.AnsweredBy)
	}

	if card, ok := spotRemovalCard(c, creatures, nil, 0); ok {
		out.Removal = card.rows
	}
	return out
}
