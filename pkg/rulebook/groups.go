package rulebook

import (
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// buildCardMap creates a name->card lookup from a cube, excluding basic lands
// and enriching multi-face cards with oracle data.
func buildCardMap(cube *types.Cube) map[string]types.Card {
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

// matchGroups resolves each group to its members with a Matcher, returning the
// members per group and the matches each group's exclude list carved out, by
// name (which the editor shows grayed).
func matchGroups(cardMap map[string]types.Card, groups []design.Group) (Members, map[string][]string) {
	groupCards := make(Members, len(groups))
	for _, g := range groups {
		groupCards[g.Name] = make(map[string]bool)
	}
	excluded := make(map[string][]string)
	matcher := NewMatcher(groups)
	for name, card := range cardMap {
		for _, m := range matcher.Match(card) {
			if m.Excluded {
				excluded[m.Group.Name] = append(excluded[m.Group.Name], name)
				continue
			}
			groupCards[m.Group.Name][name] = true
		}
	}
	for name := range excluded {
		slices.Sort(excluded[name])
	}
	return groupCards, excluded
}

// widen returns cardMap plus any deck-referenced cards not in the
// cube, hydrated from oracle data. It returns cardMap unchanged when there's
// nothing to add, so callers can detect widening by comparing lengths.
func widen(cardMap map[string]types.Card, deckCardNames []string) map[string]types.Card {
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

// addCardRefs adds each wire's card references as single-card pseudo-groups,
// keyed by the raw wire entry, so the wire and group-graph loops need no special
// case for a card named directly in a package. An unknown card (typo, or cut from
// the cube) resolves empty, same as a dangling group name.
func addCardRefs(packages []design.Package, cardMap map[string]types.Card, groupCards Members) {
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

// Members maps each group and card: entry to the names of the cards in it.
type Members map[string]map[string]bool

// Side returns every card in the named entries, such as one side of a wire.
func (m Members) Side(entries []string) map[string]bool {
	out := make(map[string]bool)
	for _, entry := range entries {
		for name := range m[entry] {
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

// Groups holds every group and card: entry resolved to card names. Cube
// covers today's list alone; Widened adds cut cards that old decks played or
// old draft lists held, so those decks keep their links and packages.
// Excluded lists the matches each group's exclude list carved out.
type Groups struct {
	Cube     Members
	Widened  Members
	Excluded map[string][]string
}

// resolveGroups resolves the rules' groups and card: entries over the cube and
// over the cube plus the cards decks have played. Excluded cards are already
// subtracted, so nothing downstream sees them.
func resolveGroups(cardMap map[string]types.Card, config design.DesignMapConfig, deckCardNames []string) Groups {
	groupCards, groupExcluded := matchGroups(cardMap, config.Groups)
	addCardRefs(config.Packages, cardMap, groupCards)

	widened := groupCards
	edgeCardMap := widen(cardMap, deckCardNames)
	if len(edgeCardMap) != len(cardMap) {
		widened, _ = matchGroups(edgeCardMap, config.Groups)
		addCardRefs(config.Packages, edgeCardMap, widened)
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

// basicLandCards is one card per basic land, built from its type line alone,
// for matching group conditions against the basics no cube list holds.
func basicLandCards() map[string]types.Card {
	out := make(map[string]types.Card, len(types.BasicLandNames))
	for _, name := range types.BasicLandNames {
		out[name] = types.FromOracle(types.OracleCard{Name: name, TypeLine: basicTypeLines[name]})
	}
	return out
}
