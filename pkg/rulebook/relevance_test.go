package rulebook

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

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
	rb, err := Load(store, src, testCube)
	require.NoError(t, err)
	pkgs := rb.Packages()

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
	rb, err := Load(store, src, testCube)
	require.NoError(t, err)
	pkgs := rb.Packages()

	lifegain := packageNamed(t, pkgs, "Lifegain")
	v, ok := lifegain.Relevance.Drafts[2]
	assert.True(t, ok && v, "an empty snapshot says nothing, so the draft's decks stay unfiltered")
}

func TestPackages_MissingSnapshotUsesToday(t *testing.T) {
	store, src := relevanceStore(t)
	rb, err := Load(store, src, testCube)
	require.NoError(t, err)
	pkgs := rb.Packages()

	lifegain := packageNamed(t, pkgs, "Lifegain")
	_, ok := lifegain.Relevance.Drafts[3]
	assert.False(t, ok, "a draft with no snapshot gets no verdict of its own")
	assert.False(t, lifegain.Relevance.InDraft(3), "so it follows today's list")
}

func TestPackages_SnapshotOnlyCardsResolve(t *testing.T) {
	store, src := relevanceStore(t)
	rb, err := Load(store, src, testCube)
	require.NoError(t, err)
	pkgs := rb.Packages()

	w := packageNamed(t, pkgs, "Lifegain").Wires[0]
	assert.True(t, w.Targets["P3"], "a card only in a snapshot still joins its side")
}

func TestPackages_OverridesForce(t *testing.T) {
	store, src := relevanceStore(t)
	require.NoError(t, store.PutOverrides(testCube, design.PackageOverrides{
		On:  []string{"lifegain", "No Such Package"},
		Off: []string{"Enablers only"},
	}))
	rb, err := Load(store, src, testCube)
	require.NoError(t, err)
	pkgs := rb.Packages()

	lifegain := packageNamed(t, pkgs, "Lifegain")
	assert.True(t, lifegain.Relevance.Today, "forced on, ignoring case")
	assert.True(t, lifegain.Relevance.InDraft(4), "forced on in every draft")

	enablers := packageNamed(t, pkgs, "Enablers only")
	assert.False(t, enablers.Relevance.Today, "forced off")
	assert.False(t, enablers.Relevance.InDraft(2), "forced off even where a draft is unfiltered")
	assert.Len(t, pkgs, 2, "an override naming no package adds nothing")
}

// relevanceStore seeds a cube whose Lifegain payoffs P1 and P2 were in draft
// 1's list but have since been cut. Draft 2 saved an empty snapshot, draft 3
// none, and draft 4's list held only P3, a payoff no deck played.
func relevanceStore(t *testing.T) (*storage.Store, fixedCubeSource) {
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
		b.SeedRules(testCube, rules)
		b.Seed(testCube,
			playDeck("Freddie", 1, 1, "2024-01-01", "E1", "E2", "P1", "P2"),
			playDeck("Ozzy", 2, 1, "2024-02-01", "E1"),
			playDeck("Stevie", 3, 1, "2024-03-01", "E1"),
			playDeck("Joan", 4, 1, "2024-04-01", "E1"),
		)
		b.SeedSnapshot(testCube, 1, namedCards("E1", "E2", "E3", "P1", "P2"))
		b.SeedSnapshot(testCube, 2, &types.Cube{})
		b.SeedSnapshot(testCube, 4, namedCards("E1", "E2", "E3", "P3"))
	})
	return store, fixedCubeSource{cube: namedCards("E1", "E2", "E3")}
}

func TestDraftLists_EmptySnapshotIsMissing(t *testing.T) {
	store, src := relevanceStore(t)
	rb, err := Load(store, src, testCube)
	require.NoError(t, err)

	lists := rb.DraftLists()
	_, hasEmpty := lists[2]
	assert.False(t, hasEmpty, "an empty snapshot says nothing about the draft's list")
	_, hasMissing := lists[3]
	assert.False(t, hasMissing, "nor does a missing one")
	assert.True(t, lists[4]["P3"])
}

func TestShown_KeepsRelevantPackagesAndTheirRules(t *testing.T) {
	store, src := relevanceStore(t)
	rb, err := Load(store, src, testCube)
	require.NoError(t, err)

	draft1 := rb.Shown(InDraft(1))
	assert.Len(t, draft1.Packages(), 2)
	assert.Len(t, draft1.Config().Packages, 2)

	draft4 := rb.Shown(InDraft(4))
	require.Len(t, draft4.Packages(), 1)
	assert.Equal(t, "Enablers only", draft4.Packages()[0].Name)
	require.Len(t, draft4.Config().Packages, 1)
	assert.Equal(t, "Enablers only", draft4.Config().Packages[0].Name)
	assert.Len(t, draft4.Config().Groups, 2, "every group stays")
	assert.Len(t, rb.Config().Packages, 2, "the rulebook itself is unchanged")
}

// brokenRulesStore fails every rules read, like a malformed rules file.
type brokenRulesStore struct {
	storage.DeckStorage
}

// GetRules fails with a read error.
func (brokenRulesStore) GetRules(string) (*design.DesignMapConfig, error) {
	return nil, errors.New("unexpected end of JSON input")
}

// noRulesStore is a store without rules support.
type noRulesStore struct {
	storage.DeckStorage
}

// GetRules says the store keeps no rules.
func (noRulesStore) GetRules(string) (*design.DesignMapConfig, error) {
	return nil, storage.ErrUnsupported
}

func TestLoad_RulesErrors(t *testing.T) {
	src := fixedCubeSource{cube: namedCards("E1")}
	store := memory.NewStore(func(*memory.Backend) {})

	_, err := Load(brokenRulesStore{DeckStorage: store}, src, testCube)
	assert.Error(t, err, "unreadable rules fail the load")

	rb, err := Load(noRulesStore{DeckStorage: store}, src, testCube)
	require.NoError(t, err, "a store without rules support loads empty rules")
	assert.Empty(t, rb.Packages())
}
