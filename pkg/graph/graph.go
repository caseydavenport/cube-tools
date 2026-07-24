// Package graph holds the deck-subgraph clustering used to find "packages" -
// cohesive communities of cards. It's shared by the packages stats and the
// community deck filter, so it depends on nothing but the standard library.
package graph

import "sort"

// A community needs at least this many cards to count as a cohesive package. Two
// linked cards is a pairing, not a strategy; the signal lives at three or more.
const MinPackageSize = 3

// Edge is one undirected, weighted, labeled connection between two cards.
// After BuildDeckSubgraph, A < B.
type Edge struct {
	A      string
	B      string
	Weight int
	Labels []string
}

// Graph is an undirected weighted graph over card names: a deck subgraph.
type Graph struct {
	Nodes []string
	Adj   map[string]map[string]int
	Edges []Edge
}

// BuildDeckSubgraph induces the subgraph on cardNames (a deck's non-basic cards)
// from the cube-wide edge list. An edge survives only when both endpoints are in
// the card set; every card becomes a node even with no surviving edges. This is
// the same subgraph the deck-viewer Map draws.
func BuildDeckSubgraph(cardNames []string, all []Edge) *Graph {
	inDeck := make(map[string]bool, len(cardNames))
	for _, n := range cardNames {
		inDeck[n] = true
	}

	nodes := append([]string(nil), cardNames...)
	sort.Strings(nodes)

	g := &Graph{Nodes: nodes, Adj: map[string]map[string]int{}}
	for _, n := range nodes {
		g.Adj[n] = map[string]int{}
	}

	for _, e := range all {
		if !inDeck[e.A] || !inDeck[e.B] || e.A == e.B {
			continue
		}
		a, b := e.A, e.B
		if a > b {
			a, b = b, a
		}
		labels := append([]string(nil), e.Labels...)
		sort.Strings(labels)
		g.Edges = append(g.Edges, Edge{A: a, B: b, Weight: e.Weight, Labels: labels})
		g.Adj[a][b] = e.Weight
		g.Adj[b][a] = e.Weight
	}
	return g
}

// Modularity returns the weighted modularity Q of a hard partition:
// Q = sum_c [ L_c/m - (D_c/2m)^2 ], where m is total edge weight, L_c the weight
// inside community c, and D_c the summed weighted degree of c's nodes.
func (g *Graph) Modularity(partition [][]string) float64 {
	deg := map[string]float64{}
	var twoM float64
	for _, n := range g.Nodes {
		d := 0.0
		for _, w := range g.Adj[n] {
			d += float64(w)
		}
		deg[n] = d
		twoM += d
	}
	if twoM == 0 {
		return 0
	}
	m := twoM / 2

	comm := map[string]int{}
	for ci, nodes := range partition {
		for _, n := range nodes {
			comm[n] = ci
		}
	}

	dc := map[int]float64{}
	for _, n := range g.Nodes {
		dc[comm[n]] += deg[n]
	}
	lc := map[int]float64{}
	for _, e := range g.Edges {
		if comm[e.A] == comm[e.B] {
			lc[comm[e.A]] += float64(e.Weight)
		}
	}

	// Sum in a fixed order. The terms are fractional, so float addition isn't
	// associative, and iterating dc in random map order would flip borderline
	// merge decisions run to run - clustering the same deck differently each call.
	cids := make([]int, 0, len(dc))
	for c := range dc {
		cids = append(cids, c)
	}
	sort.Ints(cids)

	q := 0.0
	for _, c := range cids {
		d := dc[c]
		q += lc[c]/m - (d/twoM)*(d/twoM)
	}
	return q
}

// GreedyModularityCommunities runs Clauset-Newman-Moore agglomerative modularity
// maximization: start with every node in its own community, then repeatedly merge
// the connected pair that most increases Q, stopping when no merge helps. At deck
// scale (n < ~50) it recomputes Q per candidate rather than tracking deltas -
// simpler and plenty fast. Returns the communities sorted largest-first and the
// final modularity.
func (g *Graph) GreedyModularityCommunities() ([][]string, float64) {
	parts := make([][]string, len(g.Nodes))
	for i, n := range g.Nodes {
		parts[i] = []string{n}
	}
	bestQ := g.Modularity(parts)
	if len(parts) <= 1 {
		return sortPartition(parts), bestQ
	}

	for {
		bi, bj := -1, -1
		bestDelta := 1e-12
		for i := 0; i < len(parts); i++ {
			for j := i + 1; j < len(parts); j++ {
				if !g.partsConnected(parts[i], parts[j]) {
					continue
				}
				q := g.Modularity(mergeParts(parts, i, j))
				if q-bestQ > bestDelta {
					bestDelta = q - bestQ
					bi, bj = i, j
				}
			}
		}
		if bi < 0 {
			break
		}
		parts = mergeParts(parts, bi, bj)
		bestQ = g.Modularity(parts)
	}
	return sortPartition(parts), bestQ
}

// PackageLabels returns the dominant label of every package-sized community.
// Labels can repeat when a deck holds two such communities with the same label.
func (g *Graph) PackageLabels() []string {
	comms, _ := g.GreedyModularityCommunities()
	var out []string
	for _, c := range comms {
		if len(c) < MinPackageSize {
			continue
		}
		if lab := DominantLabel(g, c); lab != "" {
			out = append(out, lab)
		}
	}
	return out
}

// partsConnected reports whether any edge joins the two node sets.
func (g *Graph) partsConnected(a, b []string) bool {
	inB := make(map[string]bool, len(b))
	for _, n := range b {
		inB[n] = true
	}
	for _, n := range a {
		for nb := range g.Adj[n] {
			if inB[nb] {
				return true
			}
		}
	}
	return false
}

// mergeParts returns a new partition with communities i and j merged.
func mergeParts(parts [][]string, i, j int) [][]string {
	merged := append(append([]string(nil), parts[i]...), parts[j]...)
	out := [][]string{merged}
	for k := range parts {
		if k != i && k != j {
			out = append(out, parts[k])
		}
	}
	return out
}

// sortPartition sorts each community's cards and orders communities largest-first
// (ties by first card name), so output is deterministic.
func sortPartition(parts [][]string) [][]string {
	out := make([][]string, 0, len(parts))
	for _, c := range parts {
		cc := append([]string(nil), c...)
		sort.Strings(cc)
		out = append(out, cc)
	}
	sort.Slice(out, func(i, j int) bool {
		if len(out[i]) != len(out[j]) {
			return len(out[i]) > len(out[j])
		}
		return out[i][0] < out[j][0]
	})
	return out
}

// DominantLabel returns the rule label carrying the most edge weight internal to
// the community (ties by label name), or "" if the community has no labeled
// internal edges. It tells us what a community "is" in rule terms.
func DominantLabel(g *Graph, community []string) string {
	in := make(map[string]bool, len(community))
	for _, n := range community {
		in[n] = true
	}
	weight := map[string]int{}
	for _, e := range g.Edges {
		if !in[e.A] || !in[e.B] {
			continue
		}
		for _, l := range e.Labels {
			weight[l] += e.Weight
		}
	}
	best, bestW := "", 0
	for l, w := range weight {
		if w > bestW || (w == bestW && (best == "" || l < best)) {
			best, bestW = l, w
		}
	}
	return best
}
