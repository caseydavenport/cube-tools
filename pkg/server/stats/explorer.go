package stats

import (
	"runtime"
	"slices"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/search"
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
// marks entries that match basic lands, packageCards holds every cube card on
// any side of each package's wires, and sides holds each wire side's cube
// cards, keyed by sideKey.
type explorerRules struct {
	config       design.DesignMapConfig
	inCube       map[string]bool
	entryCards   map[string]map[string]bool
	basicEntries map[string]bool
	packageCards map[string]map[string]bool
	sides        map[string]wireSideCards
}

// wireSideCards is one wire side resolved over the cube: its cube cards, and
// whether any of its entries matches basic lands.
type wireSideCards struct {
	cards  map[string]bool
	basics bool
}

// sideKey is a wire side's key in explorerRules.sides: its entries joined.
func sideKey(entries []string) string {
	return strings.Join(entries, "\x1f")
}

// newExplorerRules resolves config over the cube for exploreCards.
func newExplorerRules(cube *types.Cube, config design.DesignMapConfig) explorerRules {
	cardMap := rulebook.CardMap(cube)
	rules := explorerRules{
		config:       config,
		inCube:       make(map[string]bool, len(cardMap)),
		entryCards:   rulebook.ResolveGroups(cardMap, config, nil).Cube,
		basicEntries: map[string]bool{},
		packageCards: map[string]map[string]bool{},
		sides:        map[string]wireSideCards{},
	}
	for name := range cardMap {
		rules.inCube[name] = true
	}

	basicGroups, _ := rulebook.MatchGroups(rulebook.BasicLandCards(), config.Groups)
	for name, basics := range basicGroups {
		if len(basics) > 0 {
			rules.basicEntries[name] = true
		}
	}

	for _, pkg := range config.Packages {
		cards := map[string]bool{}
		for _, w := range pkg.Wires {
			for name := range rulebook.WireSide(rules.entryCards, slices.Concat(w.Sources, w.Targets)) {
				cards[name] = true
			}
			rules.addSide(w.Sources)
			rules.addSide(w.Targets)
		}
		rules.packageCards[pkg.Name] = cards
	}
	return rules
}

// addSide resolves a wire side once, so scoring a card looks it up.
func (r explorerRules) addSide(entries []string) {
	key := sideKey(entries)
	if _, ok := r.sides[key]; ok {
		return
	}
	side := wireSideCards{cards: rulebook.WireSide(r.entryCards, entries)}
	for _, entry := range entries {
		side.basics = side.basics || r.basicEntries[entry]
	}
	r.sides[key] = side
}

// side returns a wire side's resolved cube cards.
func (r explorerRules) side(entries []string) wireSideCards {
	return r.sides[sideKey(entries)]
}

// countWithout is how many of the cards there are, leaving out name.
func countWithout(cards map[string]bool, name string) int {
	if cards[name] {
		return len(cards) - 1
	}
	return len(cards)
}

// exploreCards scores each hit against rules. thin is the most cube cards a
// role can already hold for a package to count toward New connections. Cards
// are scored independently, so the work is spread across the CPUs.
func exploreCards(hits map[string]types.Card, rules explorerRules, thin int) []ExplorerCard {
	groups := compileGroups(rules.config.Groups)
	names := make([]string, 0, len(hits))
	for name := range hits {
		names = append(names, name)
	}

	out := make([]ExplorerCard, len(names))
	var next atomic.Int64
	var wg sync.WaitGroup
	for range explorerWorkers(len(names)) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				i := int(next.Add(1) - 1)
				if i >= len(names) {
					return
				}
				card := hits[names[i]]
				out[i] = exploreCard(card, rules.inCube[card.Name], groups.match(card), rules, thin)
			}
		}()
	}
	wg.Wait()
	return out
}

// cardsPerWorker is the fewest cards worth a worker of their own, so a small
// search doesn't start goroutines it can't use.
const cardsPerWorker = 64

// explorerWorkers is how many workers score n cards: one per CPU, fewer for a
// small search.
func explorerWorkers(n int) int {
	return max(1, min(runtime.GOMAXPROCS(0), n/cardsPerWorker))
}

// compiledGroups is the rules' groups with their conditions compiled once,
// for matching many cards.
type compiledGroups struct {
	groups  []design.Group
	queries [][]*search.Query
}

func compileGroups(groups []design.Group) compiledGroups {
	out := compiledGroups{groups: groups, queries: make([][]*search.Query, len(groups))}
	for i, g := range groups {
		for _, cond := range g.Conditions {
			out.queries[i] = append(out.queries[i], rulebook.Condition(cond))
		}
	}
	return out
}

// match finds the groups a card lands in with the first condition each
// matched, honoring exclude lists, sorted by group name. The card is prepared
// once and judged by every condition.
func (c compiledGroups) match(card types.Card) []ExplorerGroup {
	prepared := search.Prepare(card, nil)
	var out []ExplorerGroup
	for i, g := range c.groups {
		if slices.Contains(g.Exclude, card.Name) {
			continue
		}
		for j, q := range c.queries[i] {
			if rulebook.ConditionMatches(q, prepared) {
				out = append(out, ExplorerGroup{Name: g.Name, Condition: g.Conditions[j]})
				break
			}
		}
	}
	slices.SortFunc(out, func(a, b ExplorerGroup) int {
		return strings.Compare(a.Name, b.Name)
	})
	return out
}

// exploreCard scores one card: its joins, linked cube cards, Uniqueness and
// New connections.
func exploreCard(card types.Card, inCube bool, groups []ExplorerGroup, rules explorerRules, thin int) ExplorerCard {
	out := newExplorerCard(card, inCube, groups)
	mine := cardEntries(card.Name, groups)

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
				for name := range rules.side(side.partner).cards {
					if name != card.Name {
						linked[name] = true
					}
				}
				if join.Others <= thin {
					thinPackages[pkg.Name] = true
				}
			}
		}
	}

	out.Linked = sortedNames(linked)
	out.Connections = append(out.Connections, packagePairs(card.Name, thinPackages, rules)...)
	return out
}

// newExplorerCard is a card's row before scoring: its details and groups,
// with lists started empty, not nil, so they reach the page as [] rather
// than null.
func newExplorerCard(card types.Card, inCube bool, groups []ExplorerGroup) ExplorerCard {
	out := ExplorerCard{
		Name:        card.Name,
		TypeLine:    typeLine(card),
		Image:       card.Image,
		URL:         card.URL,
		CMC:         card.CMC,
		InCube:      inCube,
		Groups:      groups,
		Joins:       []ExplorerJoin{},
		Connections: []PackageConnection{},
	}
	if out.Groups == nil {
		out.Groups = []ExplorerGroup{}
	}
	if card.IsCreature() {
		out.Power = card.Power
		out.Toughness = card.Toughness
	}
	return out
}

// cardEntries are the rule entries a card is in: its groups, and a card:
// entry naming it.
func cardEntries(name string, groups []ExplorerGroup) map[string]bool {
	mine := map[string]bool{design.CardRefPrefix + name: true}
	for _, g := range groups {
		mine[g.Name] = true
	}
	return mine
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

	partner := rules.side(side.partner)
	partnerCards := countWithout(partner.cards, name)
	if partnerCards == 0 && !partner.basics {
		return ExplorerJoin{}, false
	}

	return ExplorerJoin{
		Package:       pkg,
		Wire:          wire,
		Role:          side.role,
		Via:           via,
		Others:        countWithout(rules.side(side.own).cards, name),
		Partner:       side.partner,
		PartnerCards:  partnerCards,
		PartnerBasics: partner.basics,
	}, true
}

// packagePairs lists each pair of the given packages with how many cube cards
// they share without the card, fewest shared first.
func packagePairs(name string, packages map[string]bool, rules explorerRules) []PackageConnection {
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
