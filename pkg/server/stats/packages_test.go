package stats

import (
	"fmt"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// deckOf builds a deck with the given mainboard card names.
func deckOf(names ...string) *storage.Deck {
	cards := make([]types.Card, len(names))
	for i, n := range names {
		cards[i] = types.Card{Name: n}
	}
	return &storage.Deck{Deck: types.Deck{Mainboard: cards}}
}

// statFor returns the row for a package, failing the test if it's absent.
func statFor(t *testing.T, resp PackageStatsResponse, name string) PackageStat {
	t.Helper()
	for _, s := range resp.Packages {
		if s.Name == name {
			return s
		}
	}
	require.Failf(t, "package not found", "no package row for %q", name)
	return PackageStat{}
}

// cardSet builds a set of card names, the shape a resolved wire side takes.
func cardSet(names ...string) map[string]bool {
	out := make(map[string]bool, len(names))
	for _, n := range names {
		out[n] = true
	}
	return out
}

// twoSided is a package with one wire whose sides each need two cards.
func twoSided(name string, sources, targets map[string]bool) design.PackageCards {
	return design.PackageCards{
		Name:  name,
		Wires: []design.WireCards{{Sources: sources, Targets: targets, NeedSources: 2, NeedTargets: 2}},
	}
}

// packageTestPackages are the resolved packages the aggregation tests run
// over: Graveyard and Ramp, each two cards wired to two others, and Fetches,
// whose fetch side decks rarely play two of.
func packageTestPackages() []design.PackageCards {
	return []design.PackageCards{
		twoSided("Graveyard", cardSet("gy1", "gy2"), cardSet("gy3", "gy4")),
		twoSided("Ramp", cardSet("r1", "r2"), cardSet("r3", "r4")),
		twoSided("Fetches", cardSet("f1", "f2"), cardSet("gy1", "gy2", "gy3", "gy4")),
	}
}

func TestPackageStats_TalliesBuildRateAndCommitment(t *testing.T) {
	decks := []*storage.Deck{
		// Graveyard and Ramp both built. Basics are stripped.
		deckOf("gy1", "gy2", "gy3", "gy4", "r1", "r2", "r3", "r4", "Forest", "Snow-Covered Island"),

		// Graveyard alone.
		deckOf("gy1", "gy2", "gy3", "gy4"),

		// Graveyard with one fetch: Fetches has the cards but only one source.
		deckOf("gy1", "gy2", "gy3", "gy4", "f1"),
	}

	resp := packageStats(packageTestPackages(), decks, 0.95)
	assert.Equal(t, 3, resp.PopulatedDecks)
	assert.Equal(t, 0.95, resp.Confidence)

	gy := statFor(t, resp, "Graveyard")
	assert.Equal(t, 3, gy.Package)
	assert.Equal(t, 3, gy.Has3)
	assert.Equal(t, 1.0, gy.BuildRate)
	assert.Equal(t, 1.0, gy.CameTogether)

	ramp := statFor(t, resp, "Ramp")
	assert.Equal(t, 1, ramp.Package)
	assert.Equal(t, 1, ramp.Has3)
	assert.Equal(t, 0.333, ramp.BuildRate)
	assert.Equal(t, 1.0, ramp.CameTogether)

	// Fetches: enough cards present, but never two from the fetch side.
	fetches := statFor(t, resp, "Fetches")
	assert.Equal(t, 0, fetches.Package)
	assert.Equal(t, 1, fetches.Has3)
	assert.Equal(t, 0.0, fetches.BuildRate)
	assert.Equal(t, 0.0, fetches.CameTogether)
	assert.Equal(t, 0.333, fetches.Has3Rate)
}

func TestPackageStats_SortedByPackageDescending(t *testing.T) {
	decks := []*storage.Deck{
		deckOf("gy1", "gy2", "gy3", "gy4", "r1", "r2", "r3", "r4"),
		deckOf("gy1", "gy2", "gy3", "gy4"),
		deckOf("gy1", "gy2", "gy3", "gy4", "f1"),
	}

	resp := packageStats(packageTestPackages(), decks, 0.95)
	require.GreaterOrEqual(t, len(resp.Packages), 2)
	for i := 1; i < len(resp.Packages); i++ {
		assert.GreaterOrEqual(t, resp.Packages[i-1].Package, resp.Packages[i].Package)
	}
	assert.Equal(t, "Graveyard", resp.Packages[0].Name)
}

func TestPackageStats_CIBracketsBuildRate(t *testing.T) {
	decks := []*storage.Deck{
		deckOf("gy1", "gy2", "gy3", "gy4", "r1", "r2", "r3", "r4"),
		deckOf("gy1", "gy2", "gy3", "gy4"),
		deckOf("gy1", "gy2", "gy3", "gy4", "f1"),
	}

	resp := packageStats(packageTestPackages(), decks, 0.95)
	for _, s := range resp.Packages {
		assert.LessOrEqual(t, s.BuildRateLow, s.BuildRate, "low above point for %s", s.Name)
		assert.GreaterOrEqual(t, s.BuildRateHigh, s.BuildRate, "high below point for %s", s.Name)
	}

	// A build rate of 1.0 pins the upper bound at 1.0.
	gy := statFor(t, resp, "Graveyard")
	assert.Equal(t, 1.0, gy.BuildRateHigh)
}

func TestPackageStats_EmptyDecksExcludedFromDenominator(t *testing.T) {
	decks := []*storage.Deck{
		deckOf("gy1", "gy2", "gy3", "gy4"),

		// Only basics: not populated, must not count toward the denominator.
		deckOf("Plains", "Island"),

		// Nothing at all.
		deckOf(),
	}

	resp := packageStats(packageTestPackages(), decks, 0.95)
	assert.Equal(t, 1, resp.PopulatedDecks)

	gy := statFor(t, resp, "Graveyard")
	assert.Equal(t, 1.0, gy.BuildRate)
}

// With no decks, every package still gets a row at zero, so the map can
// draw a cube that has only a card list.
func TestPackageStats_NoDecksKeepsPackagesAtZero(t *testing.T) {
	resp := packageStats(packageTestPackages(), nil, 0.8)
	assert.Equal(t, 0, resp.PopulatedDecks)
	require.Len(t, resp.Packages, 3)
	for _, s := range resp.Packages {
		assert.Equal(t, 0, s.Package)
		assert.Equal(t, 0.0, s.BuildRate)
		assert.False(t, s.RarelyTogether)
	}
}

func TestPackageStats_BothSides(t *testing.T) {
	pkgs := []design.PackageCards{twoSided("Combo", cardSet("A", "B"), cardSet("C", "D", "E"))}
	decks := []*storage.Deck{
		deckOf("A", "B", "C", "D"),

		// Plenty of the package's cards, but only one source.
		deckOf("A", "C", "D", "E"),

		deckOf("Z"),
	}

	resp := packageStats(pkgs, decks, 0.95)
	assert.Equal(t, 3, resp.PopulatedDecks)
	combo := statFor(t, resp, "Combo")
	assert.Equal(t, 1, combo.Package)
	assert.Equal(t, 2, combo.Has3)
	assert.Equal(t, 0.333, combo.BuildRate)
}

func TestPackageStats_IgnoresBasics(t *testing.T) {
	pkgs := []design.PackageCards{twoSided("Mountains", cardSet("A", "B"), cardSet("Mountain", "C"))}

	// Mountain would be the second target, but basics never count.
	resp := packageStats(pkgs, []*storage.Deck{deckOf("A", "B", "Mountain", "C")}, 0.95)
	assert.Equal(t, 0, statFor(t, resp, "Mountains").Package)

	// With a second non-basic target the same deck builds it.
	pkgs = []design.PackageCards{twoSided("Mountains", cardSet("A", "B"), cardSet("Mountain", "C", "D"))}
	resp = packageStats(pkgs, []*storage.Deck{deckOf("A", "B", "Mountain", "C", "D")}, 0.95)
	assert.Equal(t, 1, statFor(t, resp, "Mountains").Package)
}

func TestPackageStats_ListsUnbuiltPackages(t *testing.T) {
	pkgs := []design.PackageCards{
		twoSided("Built", cardSet("A", "B"), cardSet("C", "D")),
		twoSided("Unused", cardSet("X", "Y"), cardSet("W", "V")),
	}

	resp := packageStats(pkgs, []*storage.Deck{deckOf("A", "B", "C", "D")}, 0.95)
	require.Len(t, resp.Packages, 2)
	unused := statFor(t, resp, "Unused")
	assert.Equal(t, 0, unused.Package)
	assert.Equal(t, 0, unused.Has3)
}

// BenchmarkPackageStats measures the per-deck check at about polyverse's
// size: 25 packages of 40 cards each and 250 decks of 40 cards.
func BenchmarkPackageStats(b *testing.B) {
	var pkgs []design.PackageCards
	for p := range 25 {
		sources := map[string]bool{}
		targets := map[string]bool{}
		for c := range 20 {
			sources[fmt.Sprintf("card%d", (p*7+c)%400)] = true
			targets[fmt.Sprintf("card%d", (p*13+c+200)%400)] = true
		}
		pkgs = append(pkgs, twoSided(fmt.Sprintf("pkg%d", p), sources, targets))
	}
	var decks []*storage.Deck
	for d := range 250 {
		var names []string
		for c := range 40 {
			names = append(names, fmt.Sprintf("card%d", (d*11+c*9)%400))
		}
		decks = append(decks, deckOf(names...))
	}

	b.ReportAllocs()
	for b.Loop() {
		packageStats(pkgs, decks, 0.8)
	}
}

func TestPackageStats_RecordOfBuilders(t *testing.T) {
	won := deckOf("gy1", "gy2", "gy3", "gy4")
	won.Matches = []types.Match{{Opponent: "Ozzy", Wins: 2, Losses: 1}}
	lost := deckOf("gy1", "gy2", "gy3", "gy4")
	lost.Matches = []types.Match{{Opponent: "Joan", Wins: 1, Losses: 2}}
	other := deckOf("r1", "r2", "r3", "r4")
	other.Matches = []types.Match{{Opponent: "Stevie", Wins: 2, Losses: 0}}

	gy := statFor(t, packageStats(packageTestPackages(), []*storage.Deck{won, lost, other}, 0.8), "Graveyard")
	assert.Equal(t, 3, gy.Record.Wins)
	assert.Equal(t, 3, gy.Record.Losses)
	assert.Equal(t, 50.0, gy.Record.BayesianWinPercent)
}

func TestMarkRarelyTogether(t *testing.T) {
	stats := []PackageStat{
		{Name: "Shuffle", Has3: 43, CameTogether: 0.09},
		{Name: "Artifacts", Has3: 50, CameTogether: 0.14},
		{Name: "Pump", Has3: 40, CameTogether: 0.46},
		{Name: "Discard", Has3: 60, CameTogether: 0.50},
		{Name: "Graveyard", Has3: 80, CameTogether: 0.67},
		{Name: "Ninjas", Has3: 5, CameTogether: 0.0},
	}
	markRarelyTogether(stats)

	var flagged []string
	for _, s := range stats {
		if s.RarelyTogether {
			flagged = append(flagged, s.Name)
		}
	}
	assert.Equal(t, []string{"Shuffle", "Artifacts"}, flagged)
}

func TestMarkRarelyTogether_NoneEligible(t *testing.T) {
	stats := []PackageStat{{Name: "Ninjas", Has3: 5, CameTogether: 0.0}}
	markRarelyTogether(stats)
	assert.False(t, stats[0].RarelyTogether)
}
