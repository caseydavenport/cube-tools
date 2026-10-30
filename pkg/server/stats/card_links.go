package stats

import (
	"cmp"
	"maps"
	"math"
	"slices"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// cardRelations is what the rules say about how cards relate, for the card
// page. cube holds the current cube's non-basic cards. groups maps every group
// and card: wire entry to its members, over the cube plus cut cards decks
// played plus any extra card being looked at. groupsByCard is the reverse.
type cardRelations struct {
	cube         map[string]types.Card
	groups       map[string]map[string]bool
	packages     []design.Package
	groupsByCard map[string][]string
}

// PartnerCard is a cube card the rules link to the card being looked at.
// Decks counts the decks in the page's date range that played it.
type PartnerCard struct {
	Name   string   `json:"name"`
	Colors []string `json:"colors"`
	Decks  int      `json:"decks"`
}

// PackagePartners lists a card's partners through one package.
type PackagePartners struct {
	Package string        `json:"package"`
	Cards   []PartnerCard `json:"cards"`
}

// CardBridge is one way the rules link two cards: a package wire with the
// first card's group on one side and the second card's on the other. Groups
// may be card: wire entries.
type CardBridge struct {
	Package    string `json:"package"`
	Group      string `json:"group"`
	OtherGroup string `json:"other_group"`
}

// roleCandidate is a cube card scored by how much it shares with the card
// whose same-role cards are being picked.
type roleCandidate struct {
	name  string
	score float64
}

// newCardRelations resolves the rules' groups over the cube, the cut cards in
// deckCardNames, and extras, cards in neither that the page is about.
func newCardRelations(cube *types.Cube, config design.DesignMapConfig, deckCardNames []string, extras []types.Card) cardRelations {
	cardMap := buildCardMap(cube)
	inCube := maps.Clone(cardMap)
	for _, extra := range extras {
		if _, ok := cardMap[extra.Name]; !ok {
			cardMap[extra.Name] = extra
		}
	}

	widened := widenWithDeckCards(cardMap, deckCardNames)
	groups, _ := resolveGroupCards(widened, config.Groups)
	registerCardRefs(config.Packages, widened, groups)

	byCard := map[string][]string{}
	for name, members := range groups {
		if cardRefName(name) != "" {
			continue
		}
		for card := range members {
			byCard[card] = append(byCard[card], name)
		}
	}
	for card := range byCard {
		slices.Sort(byCard[card])
	}

	return cardRelations{cube: inCube, groups: groups, packages: config.Packages, groupsByCard: byCard}
}

// groupsOf lists the groups holding the card, sorted, leaving out card: wire
// entries.
func (r cardRelations) groupsOf(card string) []string {
	out := slices.Clone(r.groupsByCard[card])
	if out == nil {
		return []string{}
	}
	return out
}

// partners lists the current cube cards that a package wire puts opposite the
// card, grouped by package and sorted by package name. Within a package, cards
// played in more decks come first; numDecksByCard gives each card's count.
func (r cardRelations) partners(card string, numDecksByCard map[string]int) []PackagePartners {
	out := []PackagePartners{}
	for _, pkg := range r.packages {
		// Collect the cards on the opposite side of every wire the card is on.
		names := map[string]bool{}
		for _, wire := range pkg.Wires {
			sources := wireSide(r.groups, wire.Sources)
			targets := wireSide(r.groups, wire.Targets)
			if sources[card] {
				maps.Copy(names, targets)
			}
			if targets[card] {
				maps.Copy(names, sources)
			}
		}

		// Keep only current cube cards, most played first.
		var cards []PartnerCard
		for name := range names {
			c, ok := r.cube[name]
			if !ok || name == card {
				continue
			}
			cards = append(cards, PartnerCard{Name: name, Colors: c.Colors, Decks: numDecksByCard[name]})
		}
		if len(cards) == 0 {
			continue
		}
		slices.SortFunc(cards, func(a, b PartnerCard) int {
			if a.Decks != b.Decks {
				return b.Decks - a.Decks
			}
			return cmp.Compare(a.Name, b.Name)
		})
		out = append(out, PackagePartners{Package: pkg.Name, Cards: cards})
	}
	slices.SortFunc(out, func(a, b PackagePartners) int {
		return strings.Compare(strings.ToLower(a.Package), strings.ToLower(b.Package))
	})
	return out
}

// linksBetween lists every package wire that links card a to card b, with a's
// group first. It's empty, not nil, when the rules don't link them.
func (r cardRelations) linksBetween(a, b string) []CardBridge {
	seen := map[CardBridge]bool{}
	out := []CardBridge{}
	add := func(bridge CardBridge) {
		if !seen[bridge] {
			seen[bridge] = true
			out = append(out, bridge)
		}
	}

	for _, pkg := range r.packages {
		for _, wire := range pkg.Wires {
			for _, source := range wire.Sources {
				for _, target := range wire.Targets {
					if r.groups[source][a] && r.groups[target][b] {
						add(CardBridge{Package: pkg.Name, Group: source, OtherGroup: target})
					}
					if r.groups[source][b] && r.groups[target][a] {
						add(CardBridge{Package: pkg.Name, Group: target, OtherGroup: source})
					}
				}
			}
		}
	}

	slices.SortFunc(out, func(x, y CardBridge) int {
		return cmp.Or(cmp.Compare(x.Package, y.Package), cmp.Compare(x.Group, y.Group), cmp.Compare(x.OtherGroup, y.OtherGroup))
	})
	return out
}

// sameRole picks up to limit cube cards that share the most with card: its
// groups and its Scryfall tags. A shared feature counts more the fewer cube
// cards have it, so a sacrifice-outlet group outweighs a small-creatures one.
func (r cardRelations) sameRole(card types.Card, limit int) []string {
	// A card's features are its groups plus its Scryfall tags.
	featuresOf := func(name string, tags []string) []string {
		features := slices.Clone(r.groupsByCard[name])
		for _, tag := range tags {
			features = append(features, "tag:"+tag)
		}
		return features
	}

	// Count how many cube cards have each feature, to weight rare ones higher.
	counts := map[string]int{}
	for name, c := range r.cube {
		for _, f := range featuresOf(name, c.OracleTags) {
			counts[f]++
		}
	}
	total := float64(len(r.cube))

	mine := map[string]bool{}
	for _, f := range featuresOf(card.Name, card.OracleTags) {
		mine[f] = true
	}

	// Score every other cube card by the rarity of the features it shares.
	var candidates []roleCandidate
	for name, c := range r.cube {
		if name == card.Name {
			continue
		}
		score := 0.0
		for _, f := range featuresOf(name, c.OracleTags) {
			if mine[f] && counts[f] > 0 {
				score += math.Log(total / float64(counts[f]))
			}
		}
		if score > 0 {
			candidates = append(candidates, roleCandidate{name: name, score: score})
		}
	}

	// Best score first, ties by name.
	slices.SortFunc(candidates, func(a, b roleCandidate) int {
		if a.score != b.score {
			return cmp.Compare(b.score, a.score)
		}
		return cmp.Compare(a.name, b.name)
	})

	out := []string{}
	for i := 0; i < len(candidates) && i < limit; i++ {
		out = append(out, candidates[i].name)
	}
	return out
}
