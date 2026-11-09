package server

import (
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CubeCard is one cube card offered to the import pages' card-name search.
// MaxCopies lets the page flag a card entered more often than the cube holds
// it, and IsLand lets it count a deck's lands.
type CubeCard struct {
	Name      string `json:"name"`
	MaxCopies int    `json:"max_copies"`
	IsLand    bool   `json:"is_land"`
}

// CubeCards lists every card in a cube list, in the list's name order, for
// the import pages' card-name search.
func CubeCards(cl *types.Cube) []CubeCard {
	cards := []CubeCard{}
	for _, name := range cl.Names() {
		cards = append(cards, CubeCard{Name: name, MaxCopies: cl.MaxCopies(name), IsLand: IsLand(name)})
	}
	return cards
}

// IsLand reports whether a card's oracle type line makes it a land. A card with
// no oracle data isn't one.
func IsLand(name string) bool {
	return strings.Contains(types.GetOracleData(name).TypeLine, "Land")
}
