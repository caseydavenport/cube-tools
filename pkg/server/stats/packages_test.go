package stats

import (
	"testing"

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

// statFor returns the row for a label, failing the test if it's absent.
func statFor(t *testing.T, resp PackageStatsResponse, label string) PackageStat {
	t.Helper()
	for _, s := range resp.Packages {
		if s.Label == label {
			return s
		}
	}
	require.Failf(t, "label not found", "no package row for %q", label)
	return PackageStat{}
}

// packageTestGraph is the cube-wide edge set the aggregation tests induce over:
// a heavy Graveyard triangle, a heavy Ramp triangle, and light Fetches edges that
// only ever attach fetch cards to graveyard cards (so fetches never cohere on
// their own).
func packageTestGraph() DesignGraphResponse {
	return DesignGraphResponse{
		Edges: []DesignGraphEdge{
			{Source: "gy1", Target: "gy2", Weight: 5, RuleLabels: []string{"Graveyard"}},
			{Source: "gy2", Target: "gy3", Weight: 5, RuleLabels: []string{"Graveyard"}},
			{Source: "gy1", Target: "gy3", Weight: 5, RuleLabels: []string{"Graveyard"}},
			{Source: "r1", Target: "r2", Weight: 5, RuleLabels: []string{"Ramp"}},
			{Source: "r2", Target: "r3", Weight: 5, RuleLabels: []string{"Ramp"}},
			{Source: "r1", Target: "r3", Weight: 5, RuleLabels: []string{"Ramp"}},
			{Source: "f1", Target: "gy1", Weight: 1, RuleLabels: []string{"Fetches"}},
			{Source: "f2", Target: "gy2", Weight: 1, RuleLabels: []string{"Fetches"}},
			{Source: "f3", Target: "gy3", Weight: 1, RuleLabels: []string{"Fetches"}},
		},
	}
}

func TestPackageStats_TalliesBuildRateAndCommitment(t *testing.T) {
	decks := []*storage.Deck{
		// Graveyard + Ramp, two separate cohesive triangles. Basics are stripped.
		deckOf("gy1", "gy2", "gy3", "r1", "r2", "r3", "Forest", "Snow-Covered Island"),

		// Graveyard alone.
		deckOf("gy1", "gy2", "gy3"),

		// Graveyard triangle with fetches hanging off it: fetches touch >=3 cards
		// but never form their own package.
		deckOf("gy1", "gy2", "gy3", "f1", "f2", "f3"),
	}

	resp := packageStats(packageTestGraph(), decks, 0.95)
	assert.Equal(t, 3, resp.PopulatedDecks)
	assert.Equal(t, 0.95, resp.Confidence)

	gy := statFor(t, resp, "Graveyard")
	assert.Equal(t, 3, gy.Package)
	assert.Equal(t, 3, gy.Has3)
	assert.Equal(t, 1.0, gy.BuildRate)
	assert.Equal(t, 1.0, gy.CommitmentRatio)

	ramp := statFor(t, resp, "Ramp")
	assert.Equal(t, 1, ramp.Package)
	assert.Equal(t, 1, ramp.Has3)
	assert.Equal(t, 0.333, ramp.BuildRate)
	assert.Equal(t, 1.0, ramp.CommitmentRatio)

	// Fetches: present on enough cards but never cohesive - glue, not a strategy.
	fetches := statFor(t, resp, "Fetches")
	assert.Equal(t, 0, fetches.Package)
	assert.Equal(t, 1, fetches.Has3)
	assert.Equal(t, 0.0, fetches.BuildRate)
	assert.Equal(t, 0.0, fetches.CommitmentRatio)
	assert.Equal(t, 0.333, fetches.Has3Rate)
}

func TestPackageStats_SortedByPackageDescending(t *testing.T) {
	decks := []*storage.Deck{
		deckOf("gy1", "gy2", "gy3", "r1", "r2", "r3"),
		deckOf("gy1", "gy2", "gy3"),
		deckOf("gy1", "gy2", "gy3", "f1", "f2", "f3"),
	}

	resp := packageStats(packageTestGraph(), decks, 0.95)
	require.GreaterOrEqual(t, len(resp.Packages), 2)
	for i := 1; i < len(resp.Packages); i++ {
		assert.GreaterOrEqual(t, resp.Packages[i-1].Package, resp.Packages[i].Package)
	}
	assert.Equal(t, "Graveyard", resp.Packages[0].Label)
}

func TestPackageStats_CIBracketsBuildRate(t *testing.T) {
	decks := []*storage.Deck{
		deckOf("gy1", "gy2", "gy3", "r1", "r2", "r3"),
		deckOf("gy1", "gy2", "gy3"),
		deckOf("gy1", "gy2", "gy3", "f1", "f2", "f3"),
	}

	resp := packageStats(packageTestGraph(), decks, 0.95)
	for _, s := range resp.Packages {
		assert.LessOrEqual(t, s.BuildRateLow, s.BuildRate, "low above point for %s", s.Label)
		assert.GreaterOrEqual(t, s.BuildRateHigh, s.BuildRate, "high below point for %s", s.Label)
	}

	// A build rate of 1.0 pins the upper bound at 1.0.
	gy := statFor(t, resp, "Graveyard")
	assert.Equal(t, 1.0, gy.BuildRateHigh)
}

func TestPackageStats_EmptyDecksExcludedFromDenominator(t *testing.T) {
	decks := []*storage.Deck{
		deckOf("gy1", "gy2", "gy3"),

		// Only basics: not populated, must not count toward the denominator.
		deckOf("Plains", "Island"),

		// Nothing at all.
		deckOf(),
	}

	resp := packageStats(packageTestGraph(), decks, 0.95)
	assert.Equal(t, 1, resp.PopulatedDecks)

	gy := statFor(t, resp, "Graveyard")
	assert.Equal(t, 1.0, gy.BuildRate)
}
