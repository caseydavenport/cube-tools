package stats

import (
	"slices"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// The roles a card can hold on a wire.
const (
	roleEnabler = "enabler"
	rolePayoff  = "payoff"
	rolePairs   = "pairs"
)

// ExplorerGroup is a group a card lands in and the first condition it matched.
type ExplorerGroup struct {
	Name      string `json:"name"`
	Condition string `json:"condition"`
}

// ExplorerJoin is one wire a card lands on. Role is enabler or payoff on an
// Enables wire, or pairs. Others counts the cube cards already in that role
// on the wire, the card itself left out. Partner lists the entries on the
// wire's opposite side; PartnerBasics marks one that matches basic lands.
type ExplorerJoin struct {
	Package       string   `json:"package"`
	Wire          int      `json:"wire"`
	Role          string   `json:"role"`
	Via           []string `json:"via"`
	Others        int      `json:"others"`
	Partner       []string `json:"partner"`
	PartnerCards  int      `json:"partner_cards"`
	PartnerBasics bool     `json:"partner_basics"`
}

// PackageConnection is a pair of packages a card joins through thin roles,
// and how many cube cards the two share without it.
type PackageConnection struct {
	A      string `json:"a"`
	B      string `json:"b"`
	Shared int    `json:"shared"`
}

// ExplorerCard is one card as the explorer shows it: where it lands in the
// rules and how much it adds where packages are short.
type ExplorerCard struct {
	Name         string              `json:"name"`
	TypeLine     string              `json:"type_line"`
	Image        string              `json:"image"`
	URL          string              `json:"url"`
	CMC          int                 `json:"cmc"`
	Power        string              `json:"power"`
	Toughness    string              `json:"toughness"`
	InCube       bool                `json:"in_cube"`
	Groups       []ExplorerGroup     `json:"groups"`
	Joins        []ExplorerJoin      `json:"joins"`
	Linked       []string            `json:"linked"`
	LinkedBasics bool                `json:"linked_basics"`
	FillsGaps    float64             `json:"fills_gaps"`
	Connections  []PackageConnection `json:"connections"`
}

// explorerRules is the cube's rules resolved once for scoring any card.
// entryCards maps each group and card: entry to its cube cards, basicEntries
// marks entries that match basic lands, and packageCards holds every cube
// card on any side of each package's wires.
type explorerRules struct {
	config       design.DesignMapConfig
	inCube       map[string]bool
	entryCards   map[string]map[string]bool
	basicEntries map[string]bool
	packageCards map[string]map[string]bool
}

// newExplorerRules resolves config over the cube for exploreCards.
func newExplorerRules(cube *types.Cube, config design.DesignMapConfig) explorerRules {
	cardMap := buildCardMap(cube)
	rules := explorerRules{
		config:       config,
		inCube:       make(map[string]bool, len(cardMap)),
		entryCards:   resolveGroups(cardMap, config, nil).cube,
		basicEntries: map[string]bool{},
		packageCards: map[string]map[string]bool{},
	}
	for name := range cardMap {
		rules.inCube[name] = true
	}

	basicGroups, _ := resolveGroupCards(basicLandCards(), config.Groups)
	for name, basics := range basicGroups {
		if len(basics) > 0 {
			rules.basicEntries[name] = true
		}
	}

	for _, pkg := range config.Packages {
		cards := map[string]bool{}
		for _, w := range pkg.Wires {
			for name := range wireSide(rules.entryCards, slices.Concat(w.Sources, w.Targets)) {
				cards[name] = true
			}
		}
		rules.packageCards[pkg.Name] = cards
	}
	return rules
}

// exploreCards scores each hit against rules. thin is the most cube cards a
// role can already hold for a package to count toward New connections.
func exploreCards(hits map[string]types.Card, rules explorerRules, thin int) []ExplorerCard {
	groups := hitGroups(hits, rules.config.Groups)

	out := make([]ExplorerCard, 0, len(hits))
	for name, card := range hits {
		out = append(out, exploreCard(card, rules.inCube[name], groups[name], rules, thin))
	}
	return out
}

// hitGroups finds, for every hit, the groups it lands in with the first
// condition each matched, honoring exclude lists. Groups are sorted by name.
func hitGroups(hits map[string]types.Card, groups []design.Group) map[string][]ExplorerGroup {
	out := map[string][]ExplorerGroup{}
	for _, g := range groups {
		seen := map[string]bool{}
		for _, cond := range g.Conditions {
			for name := range matchCards(hits, cond) {
				if seen[name] || slices.Contains(g.Exclude, name) {
					continue
				}
				seen[name] = true
				out[name] = append(out[name], ExplorerGroup{Name: g.Name, Condition: cond})
			}
		}
	}
	for name := range out {
		slices.SortFunc(out[name], func(a, b ExplorerGroup) int {
			return strings.Compare(a.Name, b.Name)
		})
	}
	return out
}

// exploreCard scores one card: its joins, linked cube cards, Fills gaps and
// New connections.
func exploreCard(card types.Card, inCube bool, groups []ExplorerGroup, rules explorerRules, thin int) ExplorerCard {
	out := ExplorerCard{
		Name:     card.Name,
		TypeLine: typeLine(card),
		Image:    card.Image,
		URL:      card.URL,
		CMC:      card.CMC,
		InCube:   inCube,
		Groups:   groups,
	}
	if card.IsCreature() {
		out.Power = card.Power
		out.Toughness = card.Toughness
	}

	// The entries the card is in: its groups, and a card: entry naming it.
	mine := map[string]bool{"card:" + card.Name: true}
	for _, g := range groups {
		mine[g.Name] = true
	}

	linked := map[string]bool{}
	thinPackages := map[string]bool{}
	for _, pkg := range rules.config.Packages {
		for i, w := range pkg.Wires {
			for _, side := range wireRoles(w) {
				join, ok := joinSide(card.Name, pkg.Name, i+1, side, mine, rules)
				if !ok {
					continue
				}
				out.Joins = append(out.Joins, join)
				out.FillsGaps += 1 / float64(join.Others+1)
				out.LinkedBasics = out.LinkedBasics || join.PartnerBasics
				for name := range without(wireSide(rules.entryCards, side.partner), card.Name) {
					linked[name] = true
				}
				if join.Others <= thin {
					thinPackages[pkg.Name] = true
				}
			}
		}
	}

	out.Linked = sortedNames(linked)
	out.Connections = connections(card.Name, thinPackages, rules)
	return out
}

// wireRole is one side of a wire seen from a card on it: the side's entries,
// the opposite side's, and the role the side plays.
type wireRole struct {
	own     []string
	partner []string
	role    string
}

// wireRoles gives both sides of a wire with their roles.
func wireRoles(w design.Wire) []wireRole {
	sourceRole, targetRole := rolePairs, rolePairs
	if w.IsEnables() {
		sourceRole, targetRole = roleEnabler, rolePayoff
	}
	return []wireRole{
		{own: w.Sources, partner: w.Targets, role: sourceRole},
		{own: w.Targets, partner: w.Sources, role: targetRole},
	}
}

// joinSide builds the card's join on one wire side, or reports false when the
// card isn't on that side or the opposite side has neither cube cards nor
// basics to pair with.
func joinSide(name, pkg string, wire int, side wireRole, mine map[string]bool, rules explorerRules) (ExplorerJoin, bool) {
	var via []string
	for _, entry := range side.own {
		if mine[entry] {
			via = append(via, entry)
		}
	}
	if len(via) == 0 {
		return ExplorerJoin{}, false
	}

	partnerCards := without(wireSide(rules.entryCards, side.partner), name)
	partnerBasics := false
	for _, entry := range side.partner {
		if rules.basicEntries[entry] {
			partnerBasics = true
		}
	}
	if len(partnerCards) == 0 && !partnerBasics {
		return ExplorerJoin{}, false
	}

	return ExplorerJoin{
		Package:       pkg,
		Wire:          wire,
		Role:          side.role,
		Via:           via,
		Others:        len(without(wireSide(rules.entryCards, side.own), name)),
		Partner:       side.partner,
		PartnerCards:  len(partnerCards),
		PartnerBasics: partnerBasics,
	}, true
}

// connections lists each pair of the given packages with how many cube cards
// they share without the card, fewest shared first.
func connections(name string, packages map[string]bool, rules explorerRules) []PackageConnection {
	names := sortedNames(packages)
	var out []PackageConnection
	for i, a := range names {
		for _, b := range names[i+1:] {
			shared := 0
			for card := range rules.packageCards[a] {
				if card != name && rules.packageCards[b][card] {
					shared++
				}
			}
			out = append(out, PackageConnection{A: a, B: b, Shared: shared})
		}
	}
	slices.SortStableFunc(out, func(x, y PackageConnection) int {
		return x.Shared - y.Shared
	})
	return out
}

// without returns set minus name.
func without(set map[string]bool, name string) map[string]bool {
	out := make(map[string]bool, len(set))
	for n := range set {
		if n != name {
			out[n] = true
		}
	}
	return out
}

// sortedNames returns the set's names, sorted ignoring case.
func sortedNames(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for n := range set {
		out = append(out, n)
	}
	slices.SortFunc(out, func(a, b string) int {
		return strings.Compare(strings.ToLower(a), strings.ToLower(b))
	})
	return out
}

// typeLine rebuilds a card's type line from its types and subtypes.
func typeLine(card types.Card) string {
	line := strings.Join(card.Types, " ")
	if len(card.SubTypes) > 0 {
		line += " — " + strings.Join(card.SubTypes, " ")
	}
	return line
}
