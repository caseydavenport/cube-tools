package rulebook

import (
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CardMap creates a name->card lookup from a cube, excluding basic lands
// and enriching multi-face cards with oracle data.
func CardMap(cube *types.Cube) map[string]types.Card {
	cardMap := make(map[string]types.Card)
	for _, c := range cube.Cards {
		if c.IsBasicLand() {
			continue
		}
		if c.OracleText == "" {
			o := types.GetOracleData(c.Name)
			if o.Name != "" {
				enriched := types.FromOracle(o)
				c.OracleText = enriched.OracleText
			}
		}
		cardMap[c.Name] = c
	}
	return cardMap
}

// MatchGroups resolves each group's conditions to its effective member set
// with the group's exclude list subtracted, returning the members per group and
// the carved-out names per group (which the editor shows grayed).
func MatchGroups(cardMap map[string]types.Card, groups []design.Group) (map[string]map[string]bool, map[string][]string) {
	matched := make([]map[string]bool, len(groups))
	for i := range groups {
		matched[i] = make(map[string]bool)
	}
	rules := groupMatches.forGroups(groups)
	for name, card := range cardMap {
		for _, i := range rules.matched(card) {
			matched[i][name] = true
		}
	}

	groupCards := make(map[string]map[string]bool, len(groups))
	excluded := make(map[string][]string)
	for i, g := range groups {
		cards := matched[i]
		for _, name := range g.Exclude {
			if cards[name] {
				delete(cards, name)
				excluded[g.Name] = append(excluded[g.Name], name)
			}
		}
		slices.Sort(excluded[g.Name])
		groupCards[g.Name] = cards
	}
	return groupCards, excluded
}

// Widen returns cardMap plus any deck-referenced cards not in the
// cube, hydrated from oracle data. It returns cardMap unchanged when there's
// nothing to add, so callers can detect widening by comparing lengths.
func Widen(cardMap map[string]types.Card, deckCardNames []string) map[string]types.Card {
	var missing []string
	for _, name := range deckCardNames {
		if _, ok := cardMap[name]; !ok {
			missing = append(missing, name)
		}
	}
	if len(missing) == 0 {
		return cardMap
	}

	widened := make(map[string]types.Card, len(cardMap)+len(missing))
	for name, c := range cardMap {
		widened[name] = c
	}
	for _, name := range missing {
		o := types.GetOracleData(name)
		if o.Name == "" {
			continue
		}
		c := types.FromOracle(o)
		if c.IsBasicLand() {
			continue
		}
		widened[name] = c
	}

	if len(widened) == len(cardMap) {
		return cardMap
	}
	return widened
}

// AddCardRefs adds each wire's card references as single-card pseudo-groups,
// keyed by the raw wire entry, so the wire and group-graph loops need no special
// case for a card named directly in a package. An unknown card (typo, or cut from
// the cube) resolves empty, same as a dangling group name.
func AddCardRefs(packages []design.Package, cardMap map[string]types.Card, groupCards map[string]map[string]bool) {
	for _, pkg := range packages {
		for _, wire := range pkg.Wires {
			for _, entry := range slices.Concat(wire.Sources, wire.Targets) {
				name := design.CardRefName(entry)
				if name == "" {
					continue
				}
				cards := make(map[string]bool)
				if _, ok := cardMap[name]; ok {
					cards[name] = true
				}
				groupCards[entry] = cards
			}
		}
	}
}

// WireSide returns every card in the named groups and card: entries of one
// side of a wire.
func WireSide(groupCards map[string]map[string]bool, entries []string) map[string]bool {
	out := make(map[string]bool)
	for _, entry := range entries {
		for name := range groupCards[entry] {
			out[name] = true
		}
	}
	return out
}

// withoutBasics returns the side's cards minus basic lands, which never count
// toward building a package.
func withoutBasics(side map[string]bool) map[string]bool {
	out := make(map[string]bool, len(side))
	for name := range side {
		if !types.IsBasic(name) {
			out[name] = true
		}
	}
	return out
}

// Groups holds every group and card: entry resolved to card names.
// cube covers the cube list alone; widened adds cards cut from the cube that
// old decks still play, so those decks keep their edges and packages.
// excluded lists the matches each group's exclude list carved out.
type Groups struct {
	Cube     map[string]map[string]bool
	Widened  map[string]map[string]bool
	Excluded map[string][]string
}

// ResolveGroups resolves the rules' groups and card: entries over the cube and
// over the cube plus the cards decks have played. Excluded cards are already
// subtracted, so nothing downstream sees them.
func ResolveGroups(cardMap map[string]types.Card, config design.DesignMapConfig, deckCardNames []string) Groups {
	groupCards, groupExcluded := MatchGroups(cardMap, config.Groups)
	AddCardRefs(config.Packages, cardMap, groupCards)

	widened := groupCards
	edgeCardMap := Widen(cardMap, deckCardNames)
	if len(edgeCardMap) != len(cardMap) {
		widened, _ = MatchGroups(edgeCardMap, config.Groups)
		AddCardRefs(config.Packages, edgeCardMap, widened)
	}
	return Groups{Cube: groupCards, Widened: widened, Excluded: groupExcluded}
}

// basicTypeLines gives each basic land's type line, so group conditions such
// as t:basic or t:forest can be run against the basics.
var basicTypeLines = map[string]string{
	"Plains":                "Basic Land — Plains",
	"Island":                "Basic Land — Island",
	"Swamp":                 "Basic Land — Swamp",
	"Mountain":              "Basic Land — Mountain",
	"Forest":                "Basic Land — Forest",
	"Wastes":                "Basic Land",
	"Snow-Covered Plains":   "Basic Snow Land — Plains",
	"Snow-Covered Island":   "Basic Snow Land — Island",
	"Snow-Covered Swamp":    "Basic Snow Land — Swamp",
	"Snow-Covered Mountain": "Basic Snow Land — Mountain",
	"Snow-Covered Forest":   "Basic Snow Land — Forest",
	"Snow-Covered Wastes":   "Basic Snow Land",
}

// BasicLandCards is one card per basic land, built from its type line alone,
// for matching group conditions against the basics no cube list holds.
func BasicLandCards() map[string]types.Card {
	out := make(map[string]types.Card, len(types.BasicLandNames))
	for _, name := range types.BasicLandNames {
		out[name] = types.FromOracle(types.OracleCard{Name: name, TypeLine: basicTypeLines[name]})
	}
	return out
}
