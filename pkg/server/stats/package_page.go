package stats

import (
	"maps"
	"net/http"
	"slices"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

const (
	// colorThinMax is the most cards a group can have in a color for the
	// color table to call that color thin.
	colorThinMax = 2

	// colorSupportMin is how many cards the other side of a package needs in
	// a color before a thin cell on this side is marked.
	colorSupportMin = 3

	// overTimeWindow is how many drafts the build rate over time is smoothed
	// across, ending at each draft.
	overTimeWindow = 5
)

// colorColumns are the color table's columns: the five colors, colorless
// nonland cards, and lands.
var colorColumns = []string{"W", "U", "B", "R", "G", "C", "L"}

// PackagePageResponse is the package page's data. Stat is the package's row
// as the index computes it over the date range; the rest explains it: its
// wires, how each group spreads over the colors, its builds per draft, the
// decks that built it, and the packages it shares groups with.
type PackagePageResponse struct {
	Name       string          `json:"name"`
	Stat       PackageStat     `json:"stat"`
	Wires      []PackageWire   `json:"wires"`
	ColorTable []GroupColorRow `json:"color_table"`
	OverTime   []DraftBuild    `json:"over_time"`
	Decks      []CardDeck      `json:"decks"`
	Related    []PackageEdge   `json:"related"`
}

// PackageWire is one wire of a package with its groups resolved to cube cards.
type PackageWire struct {
	Sources []WireGroup `json:"sources"`
	Targets []WireGroup `json:"targets"`
}

// WireGroup is one entry on a wire side: a group and its cube cards, or a
// single named card. OtherPackages names the other packages using the group.
type WireGroup struct {
	Name          string   `json:"name"`
	Cards         []string `json:"cards"`
	OtherPackages []string `json:"other_packages"`
}

// GroupColorRow is one group's cards counted by color, for the support-by-
// color table. Side is "source" or "target". A Total row sums a whole side,
// and only those rows list Thin colors: where the side is thin but the
// package's other side is not.
type GroupColorRow struct {
	Group  string         `json:"group"`
	Side   string         `json:"side"`
	Total  bool           `json:"total"`
	Counts map[string]int `json:"counts"`
	Thin   []string       `json:"thin"`
}

// DraftBuild is one draft's builds of the package: Built of Decks decks with
// a non-basic card. Smoothed is the build rate in percent over the drafts
// ending here, overTimeWindow of them. InRange marks drafts in the date range.
type DraftBuild struct {
	DraftID  int     `json:"draft_id"`
	Date     string  `json:"date"`
	Built    int     `json:"built"`
	Decks    int     `json:"decks"`
	Smoothed float64 `json:"smoothed"`
	InRange  bool    `json:"in_range"`
}

// PackagePageHandler serves the package page for the package named by the
// "name" query parameter, matched ignoring case. It follows the date range but
// not the deck filter, like the card page.
func PackagePageHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &packagePageHandler{q: newQuery(store, src), store: store, src: src}
}

type packagePageHandler struct {
	q     *deckquery.Query
	store storage.DeckStorage
	src   types.CubeSource
}

// ServeHTTP answers one package page request: 404 for a name the rules don't
// have, else the page's data as JSON.
func (h *packagePageHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	cubeID := server.CubeFromRequest(r)
	name := query.GetString(r, "name")
	start := query.GetString(r, "start")
	end := query.GetString(r, "end")
	logrus.WithField("package", name).Info("/api/stats/package")

	rules, err := loadDesignInputs(h.store, h.src, cubeID)
	if err != nil {
		logrus.WithError(err).Error("could not load the rules for the package page")
		http.Error(rw, "could not load rules", http.StatusInternalServerError)
		return
	}
	idx := slices.IndexFunc(rules.config.Packages, func(p design.Package) bool { return strings.EqualFold(p.Name, name) })
	if idx < 0 {
		http.Error(rw, "unknown package", http.StatusNotFound)
		return
	}
	pkg := rules.config.Packages[idx]

	all, err := h.q.Decks(cubeID, &storage.DecksRequest{})
	if err != nil {
		logrus.WithError(err).Error("could not load decks for the package page")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}
	ranged, err := h.q.Decks(cubeID, &storage.DecksRequest{Start: start, End: end})
	if err != nil {
		logrus.WithError(err).Error("could not load decks in range for the package page")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	page := packagePageInputs{
		pkg:    pkg,
		rules:  rules,
		all:    all,
		ranged: ranged,
		start:  start,
		end:    end,
		conf:   query.GetFloat(r, "confidence"),
	}
	writeJSON(rw, buildPackagePage(page), "package page")
}

// packagePageInputs is what the package page is built from: the package, the
// rules and cube, every deck and those in the date range, the range itself,
// and the interval's confidence.
type packagePageInputs struct {
	pkg    design.Package
	rules  designInputs
	all    []*storage.Deck
	ranged []*storage.Deck
	start  string
	end    string
	conf   float64
}

// buildPackagePage computes every section of the package page.
func buildPackagePage(page packagePageInputs) PackagePageResponse {
	cube := page.rules.cube
	resolved := resolvePackages(cube, page.rules.config, page.rules.deckCardNames)
	idx := slices.IndexFunc(resolved, func(p design.PackageCards) bool { return p.Name == page.pkg.Name })
	cards := resolved[idx]

	resp := PackagePageResponse{Name: page.pkg.Name, Related: []PackageEdge{}}

	// The package's index row, over the date range.
	stats := packageStats(resolved, page.ranged, page.conf)
	for _, s := range stats.Packages {
		if s.Name == page.pkg.Name {
			resp.Stat = s
		}
	}
	resp.Stat.Color = packageColor(cards, cube)
	resp.Stat.CardCount = packageCardCount(cards, cube)

	// The wires, the color table built from them, and builds per draft.
	cardMap := buildCardMap(cube)
	groups := resolveGroups(cardMap, page.rules.config, page.rules.deckCardNames)
	resp.Wires = packageWires(page.pkg, groups.cube, page.rules.config)
	resp.ColorTable = colorTable(resp.Wires, cardMap)
	resp.OverTime = packageOverTime(cards, page.all, page.start, page.end)

	// The decks in range that built the package.
	var built []*storage.Deck
	for _, d := range page.ranged {
		if cards.BuiltBy(deckCardSet(d)) {
			built = append(built, d)
		}
	}
	resp.Decks = deckRows(built)

	// Related packages, with the edge turned so this package is the source.
	for _, e := range packageEdges(page.rules.config) {
		if e.Source == page.pkg.Name {
			resp.Related = append(resp.Related, e)
		} else if e.Target == page.pkg.Name {
			resp.Related = append(resp.Related, PackageEdge{Source: e.Target, Target: e.Source, Groups: e.Groups})
		}
	}
	return resp
}

// deckCardSet is the deck's non-basic mainboard as a set, the shape package
// checks take.
func deckCardSet(d *storage.Deck) map[string]bool {
	out := map[string]bool{}
	for _, name := range nonBasicMainboard(d) {
		out[name] = true
	}
	return out
}

// packageWires resolves each of the package's wires to its groups' cube
// cards. A "card:" entry becomes a one-card group named after the card.
// groups maps rule entries to cube cards; config finds the other packages
// using each group.
func packageWires(pkg design.Package, groups map[string]map[string]bool, config design.DesignMapConfig) []PackageWire {
	out := []PackageWire{}
	for _, w := range pkg.Wires {
		out = append(out, PackageWire{
			Sources: wireGroups(pkg.Name, w.Sources, groups, config),
			Targets: wireGroups(pkg.Name, w.Targets, groups, config),
		})
	}
	return out
}

// wireGroups resolves one wire side's entries for the package named pkg.
func wireGroups(pkg string, entries []string, groups map[string]map[string]bool, config design.DesignMapConfig) []WireGroup {
	out := []WireGroup{}
	for _, entry := range entries {
		group := WireGroup{Name: entry, Cards: slices.Sorted(maps.Keys(groups[entry])), OtherPackages: []string{}}
		if name := cardRefName(entry); name != "" {
			group.Name = name
		} else {
			group.OtherPackages = packagesUsing(entry, pkg, config)
		}
		if group.Cards == nil {
			group.Cards = []string{}
		}
		out = append(out, group)
	}
	return out
}

// packagesUsing names the packages other than skip whose wires use group.
func packagesUsing(group, skip string, config design.DesignMapConfig) []string {
	out := []string{}
	for _, p := range config.Packages {
		if p.Name != skip && packageGroups(p)[group] {
			out = append(out, p.Name)
		}
	}
	slices.Sort(out)
	return out
}

// colorTable counts each wire group's cards by color, one row per group and
// side in wire order, then a total row for each side. A gold card counts in
// each of its colors, a land only under "L", and a colorless nonland card
// under "C". A side's total marks a color thin when the side has colorThinMax
// cards or fewer in it while the other side has colorSupportMin or more.
func colorTable(wires []PackageWire, cards map[string]types.Card) []GroupColorRow {
	var sources, targets []WireGroup
	for _, w := range wires {
		sources = append(sources, w.Sources...)
		targets = append(targets, w.Targets...)
	}

	out := []GroupColorRow{}
	seen := map[string]bool{}
	for _, w := range wires {
		out = appendColorRows(out, w.Sources, "source", cards, seen)
		out = appendColorRows(out, w.Targets, "target", cards, seen)
	}

	sourceTotals := colorCounts(groupsCards(sources), cards)
	targetTotals := colorCounts(groupsCards(targets), cards)
	out = append(out,
		GroupColorRow{Group: "All of one side", Side: "source", Total: true, Counts: sourceTotals, Thin: thinColors(sourceTotals, targetTotals)},
		GroupColorRow{Group: "All of the other side", Side: "target", Total: true, Counts: targetTotals, Thin: thinColors(targetTotals, sourceTotals)},
	)
	return out
}

// thinColors lists the colors, in WUBRG order, where side has colorThinMax
// cards or fewer and other has colorSupportMin or more. A side with no
// nonland cards is never thin.
func thinColors(side, other map[string]int) []string {
	out := []string{}

	// Lands carry no color here, so a side of only lands says nothing about
	// colors.
	nonLand := side["C"]
	for _, color := range colorColumns[:5] {
		nonLand += side[color]
	}
	if nonLand == 0 {
		return out
	}
	for _, color := range colorColumns[:5] {
		if side[color] <= colorThinMax && other[color] >= colorSupportMin {
			out = append(out, color)
		}
	}
	return out
}

// appendColorRows adds a row for each group on one wire side, skipping a group
// already listed on that side.
func appendColorRows(out []GroupColorRow, groups []WireGroup, side string, cards map[string]types.Card, seen map[string]bool) []GroupColorRow {
	for _, g := range groups {
		key := side + "/" + g.Name
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, GroupColorRow{Group: g.Name, Side: side, Counts: colorCounts(g.Cards, cards), Thin: []string{}})
	}
	return out
}

// groupsCards is every card in the groups, each once.
func groupsCards(groups []WireGroup) []string {
	seen := map[string]bool{}
	var out []string
	for _, g := range groups {
		for _, name := range g.Cards {
			if !seen[name] {
				seen[name] = true
				out = append(out, name)
			}
		}
	}
	return out
}

// colorCounts counts the named cards under the color table's columns, with a
// zero for every column so the table has no gaps. Unknown names are skipped.
func colorCounts(names []string, cards map[string]types.Card) map[string]int {
	counts := map[string]int{}
	for _, col := range colorColumns {
		counts[col] = 0
	}
	for _, name := range names {
		c, ok := cards[name]
		if !ok {
			continue
		}
		if c.IsLand() {
			counts["L"]++
			continue
		}
		if len(c.Colors) == 0 {
			counts["C"]++
		}
		for _, color := range c.Colors {
			counts[color]++
		}
	}
	return counts
}

// packageOverTime counts, for every draft in draft order, the decks with a
// non-basic card and the decks that built the package, and smooths the build
// rate over the overTimeWindow drafts ending at each. start and end, either
// empty for open, mark the drafts in the date range.
func packageOverTime(pkg design.PackageCards, all []*storage.Deck, start, end string) []DraftBuild {
	byDraft := map[int]*DraftBuild{}
	for _, d := range all {
		draftID := d.Metadata.DraftID
		row, ok := byDraft[draftID]
		if !ok {
			row = &DraftBuild{DraftID: draftID, Date: d.Date}
			byDraft[draftID] = row
		}
		deck := deckCardSet(d)
		if len(deck) == 0 {
			continue
		}
		row.Decks++
		if pkg.BuiltBy(deck) {
			row.Built++
		}
	}

	// Rows in draft order, marked in or out of the date range.
	out := []DraftBuild{}
	for _, draftID := range slices.Sorted(maps.Keys(byDraft)) {
		row := *byDraft[draftID]
		row.InRange = (start == "" || row.Date >= start) && (end == "" || row.Date <= end)
		out = append(out, row)
	}

	// Smooth each row over the window of drafts ending at it.
	for i := range out {
		built, decks := 0, 0
		for _, prev := range out[max(0, i-overTimeWindow+1) : i+1] {
			built += prev.Built
			decks += prev.Decks
		}
		if decks > 0 {
			out[i].Smoothed = round1(100 * float64(built) / float64(decks))
		}
	}
	return out
}
