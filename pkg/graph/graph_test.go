package graph

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// commSizes returns the community sizes largest-first, so a test can assert the
// shape of a partition without pinning card identities.
func commSizes(comms [][]string) []int {
	out := make([]int, len(comms))
	for i, c := range comms {
		out[i] = len(c)
	}
	return out
}

func TestBuildDeckSubgraph_InducesOnCardSet(t *testing.T) {
	edges := []Edge{
		{A: "A", B: "B", Weight: 1, Labels: []string{"X"}},
		{A: "B", B: "C", Weight: 1, Labels: []string{"X"}},

		// D isn't in the deck, so this edge must not survive.
		{A: "C", B: "D", Weight: 1, Labels: []string{"X"}},
	}
	g := BuildDeckSubgraph([]string{"C", "A", "B"}, edges)

	assert.Equal(t, []string{"A", "B", "C"}, g.Nodes)
	assert.Len(t, g.Edges, 2)
	assert.Equal(t, 1, g.Adj["A"]["B"])
	assert.Equal(t, 1, g.Adj["B"]["C"])
	assert.NotContains(t, g.Adj, "D")
}

func TestGreedyModularity_StarStaysOneCommunity(t *testing.T) {
	// A hub linked to three leaves is a single cohesive cluster.
	edges := []Edge{
		{A: "hub", B: "l1", Weight: 1, Labels: []string{"X"}},
		{A: "hub", B: "l2", Weight: 1, Labels: []string{"X"}},
		{A: "hub", B: "l3", Weight: 1, Labels: []string{"X"}},
	}
	g := BuildDeckSubgraph([]string{"hub", "l1", "l2", "l3"}, edges)

	comms, _ := g.GreedyModularityCommunities()
	assert.Equal(t, []int{4}, commSizes(comms))
}

func TestGreedyModularity_TwoTrianglesSplitOnWeakBridge(t *testing.T) {
	// Two tight triangles joined by a single light edge: modularity favors
	// keeping them apart.
	edges := []Edge{
		{A: "a1", B: "a2", Weight: 5, Labels: []string{"X"}},
		{A: "a2", B: "a3", Weight: 5, Labels: []string{"X"}},
		{A: "a1", B: "a3", Weight: 5, Labels: []string{"X"}},
		{A: "b1", B: "b2", Weight: 5, Labels: []string{"Y"}},
		{A: "b2", B: "b3", Weight: 5, Labels: []string{"Y"}},
		{A: "b1", B: "b3", Weight: 5, Labels: []string{"Y"}},
		{A: "a1", B: "b1", Weight: 1, Labels: []string{"Z"}},
	}
	g := BuildDeckSubgraph([]string{"a1", "a2", "a3", "b1", "b2", "b3"}, edges)

	comms, q := g.GreedyModularityCommunities()
	assert.Equal(t, []int{3, 3}, commSizes(comms))
	assert.Greater(t, q, 0.0)
}

func TestGreedyModularity_IsolatedNodesStaySingletons(t *testing.T) {
	// One connected triangle plus two edgeless cards. The triangle clusters; the
	// loners stay on their own and never reach package size.
	edges := []Edge{
		{A: "a1", B: "a2", Weight: 1, Labels: []string{"X"}},
		{A: "a2", B: "a3", Weight: 1, Labels: []string{"X"}},
		{A: "a1", B: "a3", Weight: 1, Labels: []string{"X"}},
	}
	g := BuildDeckSubgraph([]string{"a1", "a2", "a3", "loner1", "loner2"}, edges)

	comms, _ := g.GreedyModularityCommunities()
	assert.Equal(t, []int{3, 1, 1}, commSizes(comms))
}

func TestDominantLabel_MostInternalWeightWins(t *testing.T) {
	edges := []Edge{
		{A: "a1", B: "a2", Weight: 3, Labels: []string{"Graveyard"}},
		{A: "a2", B: "a3", Weight: 1, Labels: []string{"Spells"}},
		{A: "a1", B: "a3", Weight: 1, Labels: []string{"Graveyard"}},
	}
	g := BuildDeckSubgraph([]string{"a1", "a2", "a3"}, edges)

	assert.Equal(t, "Graveyard", DominantLabel(g, []string{"a1", "a2", "a3"}))
}

func TestDominantLabel_TieBreaksByName(t *testing.T) {
	edges := []Edge{
		{A: "a1", B: "a2", Weight: 1, Labels: []string{"Zombies"}},
		{A: "a2", B: "a3", Weight: 1, Labels: []string{"Artifacts"}},
	}
	g := BuildDeckSubgraph([]string{"a1", "a2", "a3"}, edges)

	assert.Equal(t, "Artifacts", DominantLabel(g, []string{"a1", "a2", "a3"}))
}

func TestDominantLabel_NoLabeledEdgesReturnsEmpty(t *testing.T) {
	g := BuildDeckSubgraph([]string{"a1", "a2"}, nil)
	require.Empty(t, g.Edges)

	assert.Equal(t, "", DominantLabel(g, []string{"a1", "a2"}))
}

func TestPackageLabels_ReturnsDominantLabelsOfPackageSizedCommunities(t *testing.T) {
	// A graveyard triangle (package-sized) plus a two-card ramp pairing (below
	// size). Only the triangle's dominant label comes back.
	edges := []Edge{
		{A: "gy1", B: "gy2", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "gy2", B: "gy3", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "gy1", B: "gy3", Weight: 5, Labels: []string{"Graveyard"}},
		{A: "r1", B: "r2", Weight: 5, Labels: []string{"Ramp"}},
	}
	g := BuildDeckSubgraph([]string{"gy1", "gy2", "gy3", "r1", "r2"}, edges)

	assert.Equal(t, []string{"Graveyard"}, g.PackageLabels())
}

func TestModularity_IsStableAcrossRuns(t *testing.T) {
	// Enough singleton communities that random map order would perturb the float
	// sum. Q must come back bit-identical every call regardless.
	var nodes []string
	var edges []Edge
	for i := range 12 {
		a := string(rune('a'+i)) + "1"
		b := string(rune('a'+i)) + "2"
		nodes = append(nodes, a, b)
		edges = append(edges, Edge{A: a, B: b, Weight: i + 1, Labels: []string{"X"}})
	}
	g := BuildDeckSubgraph(nodes, edges)

	partition := make([][]string, len(g.Nodes))
	for i, n := range g.Nodes {
		partition[i] = []string{n}
	}

	want := g.Modularity(partition)
	for range 200 {
		assert.Equal(t, want, g.Modularity(partition))
	}
}

func TestGreedyModularity_IsStableAcrossRuns(t *testing.T) {
	// The same subgraph must cluster identically on every call, or a community:
	// filter would return a different deck set each request.
	edges := []Edge{
		{A: "a1", B: "a2", Weight: 5, Labels: []string{"X"}},
		{A: "a2", B: "a3", Weight: 5, Labels: []string{"X"}},
		{A: "a1", B: "a3", Weight: 5, Labels: []string{"X"}},
		{A: "b1", B: "b2", Weight: 5, Labels: []string{"Y"}},
		{A: "b2", B: "b3", Weight: 5, Labels: []string{"Y"}},
		{A: "b1", B: "b3", Weight: 5, Labels: []string{"Y"}},
		{A: "a1", B: "b1", Weight: 2, Labels: []string{"Z"}},
		{A: "a2", B: "b2", Weight: 2, Labels: []string{"Z"}},
	}
	g := BuildDeckSubgraph([]string{"a1", "a2", "a3", "b1", "b2", "b3"}, edges)

	want := g.PackageLabels()
	for range 200 {
		assert.Equal(t, want, g.PackageLabels())
	}
}
