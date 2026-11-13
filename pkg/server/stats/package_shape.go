package stats

import (
	"cmp"
	"slices"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

const (
	// packageColorShare is the least share of a package's non-land cards one
	// color must hold for the package to take that color on the map.
	packageColorShare = 0.3

	// packageColorLead is how many times the runner-up's count the main color
	// must reach, so a near tie leaves the package gray.
	packageColorLead = 1.25

	// mostLinkedShown is how many cards the Packages map's most-linked list
	// shows.
	mostLinkedShown = 15
)

// PackageEdge joins two packages whose wires use the same groups. Source and
// Target are package names in name order; Groups names the shared groups.
type PackageEdge struct {
	Source string   `json:"source"`
	Target string   `json:"target"`
	Groups []string `json:"groups"`
}

// packageCubeCards returns the package's cards that are in the cube, across
// every wire side, each once.
func packageCubeCards(p design.PackageCards, cube *types.Cube) []types.Card {
	inCube := map[string]types.Card{}
	for _, c := range cube.Cards {
		inCube[c.Name] = c
	}
	seen := map[string]bool{}
	var out []types.Card
	for _, w := range p.Wires {
		for _, side := range []map[string]bool{w.Sources, w.Targets} {
			for name := range side {
				c, ok := inCube[name]
				if !ok || seen[name] {
					continue
				}
				seen[name] = true
				out = append(out, c)
			}
		}
	}
	return out
}

// packageCardCount is how many of the cube's cards the package's wires use.
func packageCardCount(p design.PackageCards, cube *types.Cube) int {
	return len(packageCubeCards(p, cube))
}

// packageColor is the package's main Magic color, for coloring it on the map:
// the color most of its non-land cube cards share, a gold card counting once
// per color. It's "" when colorless cards lead, no color holds
// packageColorShare of the cards, or the lead over the next color is small.
func packageColor(p design.PackageCards, cube *types.Cube) string {
	// Count each color's cards, and the colorless ones.
	counts := map[string]int{}
	colorless, nonLand := 0, 0
	for _, c := range packageCubeCards(p, cube) {
		if c.IsLand() {
			continue
		}
		nonLand++
		if len(c.Colors) == 0 {
			colorless++
		}
		for _, color := range c.Colors {
			counts[color]++
		}
	}

	// Find the leading color and the runner-up's count.
	best, bestCount, runnerUp := "", 0, 0
	for _, color := range wubrgColumns {
		if counts[color] > bestCount {
			best, bestCount, runnerUp = color, counts[color], bestCount
		} else if counts[color] > runnerUp {
			runnerUp = counts[color]
		}
	}

	// Gray unless the leader beats colorless, the runner-up and the share bar.
	if bestCount == 0 || bestCount <= colorless {
		return ""
	}
	if float64(bestCount) < packageColorLead*float64(runnerUp) {
		return ""
	}
	if float64(bestCount) < packageColorShare*float64(nonLand) {
		return ""
	}
	return best
}

// compareNamesIgnoringCase orders names the way the design graph sorts its
// groups and packages, so colors keyed to the sorted index agree across pages.
func compareNamesIgnoringCase(a, b string) int {
	return strings.Compare(strings.ToLower(a), strings.ToLower(b))
}

// packageGroups returns the group names a package's wires use, leaving out
// entries that name a single card.
func packageGroups(p design.Package) map[string]bool {
	out := map[string]bool{}
	for _, w := range p.Wires {
		for _, entry := range slices.Concat(w.Sources, w.Targets) {
			if design.CardRefName(entry) == "" {
				out[entry] = true
			}
		}
	}
	return out
}

// packageEdges joins every pair of packages that use a group in common, in
// name order, so the map can draw how packages overlap.
func packageEdges(config design.DesignMapConfig) []PackageEdge {
	pkgs := slices.Clone(config.Packages)
	slices.SortFunc(pkgs, func(a, b design.Package) int { return strings.Compare(a.Name, b.Name) })

	out := []PackageEdge{}
	for i, a := range pkgs {
		aGroups := packageGroups(a)
		for _, b := range pkgs[i+1:] {
			var shared []string
			for group := range packageGroups(b) {
				if aGroups[group] {
					shared = append(shared, group)
				}
			}
			if len(shared) == 0 {
				continue
			}
			slices.Sort(shared)
			out = append(out, PackageEdge{Source: a.Name, Target: b.Name, Groups: shared})
		}
	}
	return out
}

// mostLinked ranks the cube's non-basic cards by how many packages use them,
// most first and then by name, keeping the first limit.
func mostLinked(pkgs []design.PackageCards, cube *types.Cube, limit int) []NamedCount {
	counts := map[string]int{}
	for _, p := range pkgs {
		for _, c := range packageCubeCards(p, cube) {
			if c.IsBasicLand() || types.IsBasic(c.Name) {
				continue
			}
			counts[c.Name]++
		}
	}

	out := []NamedCount{}
	for name, n := range counts {
		out = append(out, NamedCount{Name: name, Count: n})
	}
	slices.SortFunc(out, func(a, b NamedCount) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), strings.Compare(a.Name, b.Name))
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}
