package rulebook

import (
	"slices"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// resolvePackages turns each package's wires into card sets, sorted by
// package name, from today's cards and the groups resolved over them. A side holds the cards decks may play, cut cards included;
// how many of them a deck needs comes from sideNeed, and which can carry a
// side alone from buildaroundCards. Basic lands are left out
// of both and listed per side instead, from the groups that match them.
func resolvePackages(cardMap map[string]types.Card, groups Groups, config design.DesignMapConfig, deckCardNames []string) []design.PackageCards {
	basicGroups, _ := MatchGroups(BasicLandCards(), config.Groups)
	buildarounds := buildaroundCards(Widen(cardMap, deckCardNames), config, groups.Widened)

	out := make([]design.PackageCards, 0, len(config.Packages))
	for _, pkg := range config.Packages {
		resolved := design.PackageCards{Name: pkg.Name}
		for _, wire := range pkg.Wires {
			sources := withoutBasics(WireSide(groups.Widened, wire.Sources))
			targets := withoutBasics(WireSide(groups.Widened, wire.Targets))
			cubeSources := withoutBasics(WireSide(groups.Cube, wire.Sources))
			cubeTargets := withoutBasics(WireSide(groups.Cube, wire.Targets))
			resolved.Wires = append(resolved.Wires, design.WireCards{
				Sources:      sources,
				Targets:      targets,
				NeedSources:  sideNeed(cubeSources, sources, len(cubeTargets)),
				NeedTargets:  sideNeed(cubeTargets, targets, len(cubeSources)),
				SourceBasics: sideBasics(basicGroups, wire.Sources),
				TargetBasics: sideBasics(basicGroups, wire.Targets),
				Buildarounds: wireBuildarounds(buildarounds, sources, targets),
			})
		}
		out = append(out, resolved)
	}
	slices.SortFunc(out, func(a, b design.PackageCards) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	return out
}

// sideBasics returns the basic lands that one wire side's groups match.
func sideBasics(basicGroups map[string]map[string]bool, entries []string) map[string]bool {
	out := make(map[string]bool)
	for _, entry := range entries {
		for name := range basicGroups[entry] {
			out[name] = true
		}
	}
	return out
}

// sideNeed is how many cards a deck must play from one wire side, from the
// side's size in the cube against the other side's, otherCube. A side whose
// cards were all cut is the scarcer side, so the old decks that played them
// still count when they played two.
func sideNeed(cubeSide, side map[string]bool, otherCube int) int {
	if len(cubeSide) == 0 && len(side) > 0 {
		return 2
	}
	return design.SideMinimum(len(cubeSide), otherCube)
}

// wireBuildarounds is the build-arounds among a wire's cards.
func wireBuildarounds(buildarounds, sources, targets map[string]bool) map[string]bool {
	out := map[string]bool{}
	for _, side := range []map[string]bool{sources, targets} {
		for name := range side {
			if buildarounds[name] {
				out[name] = true
			}
		}
	}
	return out
}
