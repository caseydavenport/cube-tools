package stats

import (
	"cmp"
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// depthCap is the most cards a depth grid counts on one side; decks with more
// fold into the last row or column.
const depthCap = 5

// PackageMap is what the package page's map draws: every group once, every
// wire with how many decks filled it, and how deep decks go into each.
// TypicalPairs is the median linked pairs over the decks that built it.
type PackageMap struct {
	Groups       []MapGroup `json:"groups"`
	Wires        []MapWire  `json:"wires"`
	TypicalPairs int        `json:"typical_pairs"`
}

// MapGroup is one wire entry on the map, by its raw rules name. Cards counts
// its cube cards. Missing marks a group the rules don't define, or a card
// entry whose card isn't in the cube; OneCard a group with a single cube card.
type MapGroup struct {
	Name          string   `json:"name"`
	Cards         int      `json:"cards"`
	CardEntry     bool     `json:"card_entry"`
	Missing       bool     `json:"missing"`
	OneCard       bool     `json:"one_card"`
	OtherPackages []string `json:"other_packages"`
}

// MapWire is one wire: its kind and entries, the decks that built the package
// through it, the median of its own linked pairs over those decks, the cube
// cards on both of its sides, and its depth grid. NeedSources and NeedTargets
// are the cards per side a deck needs to build it.
type MapWire struct {
	Kind         string      `json:"kind"`
	Sources      []string    `json:"sources"`
	Targets      []string    `json:"targets"`
	NeedSources  int         `json:"need_sources"`
	NeedTargets  int         `json:"need_targets"`
	Decks        int         `json:"decks"`
	TypicalPairs int         `json:"typical_pairs"`
	SelfLinked   []string    `json:"self_linked"`
	Depth        []DepthCell `json:"depth"`
}

// DepthCell is one cell of a wire's depth grid: the decks that played A cards
// from the wire's sources side and B from its targets side, each capped at
// depthCap. Built counts the ones that built the package through the wire.
type DepthCell struct {
	A     int         `json:"a"`
	B     int         `json:"b"`
	Count int         `json:"count"`
	Built int         `json:"built"`
	Decks []DepthDeck `json:"decks"`
}

// DepthDeck is one deck in a depth cell, marked when it built the wire.
type DepthDeck struct {
	CardDeck
	Built bool `json:"built"`
}

// buildPackageMap builds the map for pkg. cards is the package resolved for
// deck checks, cube resolves entries to cube cards, and decks are the decks
// in the date range.
func buildPackageMap(pkg design.Package, cards design.PackageCards, cube rulebook.Members, config design.DesignMapConfig, decks []*storage.Deck) PackageMap {
	out := PackageMap{Groups: mapGroups(pkg, cube, config), Wires: []MapWire{}}

	// Only decks whose draft supports the package count toward it.
	decks = slices.DeleteFunc(slices.Clone(decks), func(d *storage.Deck) bool {
		return !cards.Relevance.InDraft(d.Metadata.DraftID)
	})

	// Each deck's card set, built once for every wire.
	sets := make([]design.CardCounts, len(decks))
	for i, d := range decks {
		sets[i] = deckCards(d)
	}

	for i, w := range pkg.Wires {
		resolved := cards.Wires[i]
		wire := MapWire{
			Kind:        w.KindOrPairs(),
			Sources:     w.Sources,
			Targets:     w.Targets,
			NeedSources: resolved.NeedSources,
			NeedTargets: resolved.NeedTargets,
			SelfLinked:  selfLinked(w, cube),
			Depth:       depthCells(resolved, decks),
		}
		var pairs []int
		for _, deck := range sets {
			if resolved.BuiltBy(deck) {
				wire.Decks++
				pairs = append(pairs, wirePairs(resolved, deck))
			}
		}
		wire.TypicalPairs = medianInt(pairs)
		out.Wires = append(out.Wires, wire)
	}

	// A deck's package pairs add up over every wire.
	var pairs []int
	for _, deck := range sets {
		if !cards.BuiltBy(deck) {
			continue
		}
		total := 0
		for _, w := range cards.Wires {
			total += wirePairs(w, deck)
		}
		pairs = append(pairs, total)
	}
	out.TypicalPairs = medianInt(pairs)
	return out
}

// mapGroups lists each entry the package's wires name, once, in wire order.
func mapGroups(pkg design.Package, cube rulebook.Members, config design.DesignMapConfig) []MapGroup {
	defined := map[string]bool{}
	for _, g := range config.Groups {
		defined[g.Name] = true
	}
	out := []MapGroup{}
	for _, entry := range wireEntries(pkg) {
		group := MapGroup{Name: entry, Cards: len(cube[entry]), OtherPackages: []string{}}
		if design.CardRefName(entry) != "" {
			group.CardEntry = true
			group.Missing = group.Cards == 0
		} else {
			group.Missing = !defined[entry]
			group.OneCard = group.Cards == 1
			group.OtherPackages = packagesUsing(entry, pkg.Name, config)
		}
		out = append(out, group)
	}
	return out
}

// selfLinked lists the cube cards on both sides of a wire, sorted.
func selfLinked(w design.Wire, cube rulebook.Members) []string {
	sources := cube.Side(w.Sources)
	targets := cube.Side(w.Targets)
	out := []string{}
	for name := range sources {
		if targets[name] {
			out = append(out, name)
		}
	}
	slices.Sort(out)
	return out
}

// wirePairs counts the card pairs a wire links in one deck: its cards on one
// side times its cards on the other, less the cards on both sides, which
// can't pair with themselves.
func wirePairs(w design.WireCards, deck design.CardCounts) int {
	a, b, both := 0, 0, 0
	for name, n := range deck {
		inA, inB := w.Sources[name], w.Targets[name]
		if inA {
			a += n
		}
		if inB {
			b += n
		}
		if inA && inB {
			both += n
		}
	}
	return a*b - both
}

// depthKey is a depth grid cell: the capped card counts on each side.
type depthKey struct {
	a int
	b int
}

// depthCells counts the decks with at least one card on the wire by how many
// they played from each side, capped at depthCap, sorted by A then B.
func depthCells(w design.WireCards, decks []*storage.Deck) []DepthCell {
	byCell := map[depthKey][]*storage.Deck{}
	builtRefs := map[string]bool{}
	for _, d := range decks {
		deck := deckCards(d)
		a, b := 0, 0
		for name, n := range deck {
			if w.Sources[name] {
				a += n
			}
			if w.Targets[name] {
				b += n
			}
		}
		if a == 0 && b == 0 {
			continue
		}
		k := depthKey{a: min(a, depthCap), b: min(b, depthCap)}
		byCell[k] = append(byCell[k], d)
		if w.BuiltBy(deck) {
			builtRefs[deckRef(d)] = true
		}
	}

	out := []DepthCell{}
	for k, cellDecks := range byCell {
		cell := DepthCell{A: k.a, B: k.b, Count: len(cellDecks), Decks: []DepthDeck{}}
		for _, row := range deckRows(cellDecks) {
			built := builtRefs[row.Ref]
			if built {
				cell.Built++
			}
			cell.Decks = append(cell.Decks, DepthDeck{CardDeck: row, Built: built})
		}
		out = append(out, cell)
	}
	slices.SortFunc(out, func(x, y DepthCell) int { return cmp.Or(cmp.Compare(x.A, y.A), cmp.Compare(x.B, y.B)) })
	return out
}

// medianInt is the middle value, the mean of the two middle values rounded
// half up for an even count, or 0 for none.
func medianInt(values []int) int {
	if len(values) == 0 {
		return 0
	}
	sorted := slices.Sorted(slices.Values(values))
	mid := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return sorted[mid]
	}
	return (sorted[mid-1] + sorted[mid] + 1) / 2
}
