package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// listSource serves one fixed card list as every cube's current list.
type listSource struct {
	cube *types.Cube
}

func (s listSource) Current(string) (*types.Cube, error) { return s.cube, nil }
func (s listSource) Refresh(string) (*types.Cube, error) { return s.cube, nil }

// relevanceCube is the cube id the relevance fixture seeds.
const relevanceCube = "rel"

// namedCards builds a cube list of plain cards with the given names.
func namedCards(names ...string) *types.Cube {
	cube := &types.Cube{}
	for _, n := range names {
		cube.Cards = append(cube.Cards, types.Card{Name: n, Types: []string{"Creature"}})
	}
	return cube
}

// relevanceStore seeds a cube whose Lifegain payoffs P1 and P2 were in draft
// 1's list but have since been cut. Draft 2 saved an empty snapshot, draft 3
// none, and draft 4's list held only P3, a payoff no deck played.
func relevanceStore(t *testing.T) (*storage.Store, listSource) {
	t.Helper()
	seedOracle(t, `[
		{"name":"P1","type_line":"Creature","oracle_text":"","colors":[],"cmc":2},
		{"name":"P2","type_line":"Creature","oracle_text":"","colors":[],"cmc":2},
		{"name":"P3","type_line":"Creature","oracle_text":"","colors":[],"cmc":2}
	]`)
	rules := &design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Enablers", Conditions: []string{"n:E1", "n:E2", "n:E3"}},
			{Name: "Payoffs", Conditions: []string{"n:P1", "n:P2", "n:P3"}},
		},
		Packages: []design.Package{
			{Name: "Lifegain", Wires: []design.Wire{{Sources: []string{"Enablers"}, Targets: []string{"Payoffs"}}}},
			{Name: "Enablers only", Wires: []design.Wire{{Sources: []string{"Enablers"}, Targets: []string{"Enablers"}}}},
		},
	}
	store := memory.NewStore(func(b *memory.Backend) {
		b.SeedRules(relevanceCube, rules)
		b.Seed(relevanceCube,
			playDeck("Freddie", 1, 1, "2024-01-01", "E1", "E2", "P1", "P2"),
			playDeck("Ozzy", 2, 1, "2024-02-01", "E1"),
			playDeck("Stevie", 3, 1, "2024-03-01", "E1"),
			playDeck("Joan", 4, 1, "2024-04-01", "E1"),
		)
		b.SeedSnapshot(relevanceCube, 1, namedCards("E1", "E2", "E3", "P1", "P2"))
		b.SeedSnapshot(relevanceCube, 2, &types.Cube{})
		b.SeedSnapshot(relevanceCube, 4, namedCards("E1", "E2", "E3", "P3"))
	})
	return store, listSource{cube: namedCards("E1", "E2", "E3")}
}

// packageNamed returns the resolved package with the given name.
func packageNamed(t *testing.T, pkgs []design.PackageCards, name string) design.PackageCards {
	t.Helper()
	for _, p := range pkgs {
		if p.Name == name {
			return p
		}
	}
	t.Fatalf("no package %q", name)
	return design.PackageCards{}
}

func TestPackages_RelevantPerDraft(t *testing.T) {
	store, src := relevanceStore(t)
	pkgs, err := PackagesForCube(store, src, relevanceCube)
	require.NoError(t, err)

	lifegain := packageNamed(t, pkgs, "Lifegain")
	require.NotNil(t, lifegain.Relevance)
	assert.True(t, lifegain.Relevance.Drafts[1], "draft 1's list held both payoffs")
	assert.False(t, lifegain.Relevance.Drafts[4], "draft 4's list held one payoff")
	assert.False(t, lifegain.Relevance.Today, "today's list holds no payoffs")

	enablers := packageNamed(t, pkgs, "Enablers only")
	assert.True(t, enablers.Relevance.Today, "a package today's list supports is relevant today")
}

func TestPackages_EmptySnapshotUnfiltered(t *testing.T) {
	store, src := relevanceStore(t)
	pkgs, err := PackagesForCube(store, src, relevanceCube)
	require.NoError(t, err)

	lifegain := packageNamed(t, pkgs, "Lifegain")
	v, ok := lifegain.Relevance.Drafts[2]
	assert.True(t, ok && v, "an empty snapshot says nothing, so the draft's decks stay unfiltered")
}

func TestPackages_MissingSnapshotUsesToday(t *testing.T) {
	store, src := relevanceStore(t)
	pkgs, err := PackagesForCube(store, src, relevanceCube)
	require.NoError(t, err)

	lifegain := packageNamed(t, pkgs, "Lifegain")
	_, ok := lifegain.Relevance.Drafts[3]
	assert.False(t, ok, "a draft with no snapshot gets no verdict of its own")
	assert.False(t, lifegain.Relevance.InDraft(3), "so it follows today's list")
}

func TestPackages_SnapshotOnlyCardsResolve(t *testing.T) {
	store, src := relevanceStore(t)
	pkgs, err := PackagesForCube(store, src, relevanceCube)
	require.NoError(t, err)

	w := packageNamed(t, pkgs, "Lifegain").Wires[0]
	assert.True(t, w.Targets["P3"], "a card only in a snapshot still joins its side")
}

func TestPackages_OverridesForce(t *testing.T) {
	store, src := relevanceStore(t)
	require.NoError(t, store.PutOverrides(relevanceCube, design.PackageOverrides{
		On:  []string{"lifegain", "No Such Package"},
		Off: []string{"Enablers only"},
	}))
	pkgs, err := PackagesForCube(store, src, relevanceCube)
	require.NoError(t, err)

	lifegain := packageNamed(t, pkgs, "Lifegain")
	assert.True(t, lifegain.Relevance.Today, "forced on, ignoring case")
	assert.True(t, lifegain.Relevance.InDraft(4), "forced on in every draft")

	enablers := packageNamed(t, pkgs, "Enablers only")
	assert.False(t, enablers.Relevance.Today, "forced off")
	assert.False(t, enablers.Relevance.InDraft(2), "forced off even where a draft is unfiltered")
	assert.Len(t, pkgs, 2, "an override naming no package adds nothing")
}
