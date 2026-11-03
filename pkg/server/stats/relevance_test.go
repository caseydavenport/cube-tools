package stats

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// relevanceCube is the cube id the relevance fixture seeds, the one
// serveCube requests.
const relevanceCube = "polyverse"

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
	return store, fixedCubeSource{cube: namedCards("E1", "E2", "E3")}
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

// packageNamesIn returns the names of the package stats rows.
func packageNamesIn(resp PackageStatsResponse) []string {
	var out []string
	for _, p := range resp.Packages {
		out = append(out, p.Name)
	}
	return out
}

// packagesOver serves the Packages page over a date range.
func packagesOver(t *testing.T, start, end string) PackageStatsResponse {
	t.Helper()
	store, src := relevanceStore(t)
	rr := serveCube(PackageStatsHandler(store, src), "/api/polyverse/stats/packages", url.Values{"start": {start}, "end": {end}})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp PackageStatsResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	return resp
}

func TestPackageStats_HidesIrrelevant(t *testing.T) {
	assert.Contains(t, packageNamesIn(packagesOver(t, "2024-01-01", "2024-01-31")), "Lifegain", "draft 1's list supported it")
	assert.NotContains(t, packageNamesIn(packagesOver(t, "2024-04-01", "2024-04-30")), "Lifegain", "draft 4's list didn't")
}

func TestPackageStats_EmptyRangeUsesToday(t *testing.T) {
	names := packageNamesIn(packagesOver(t, "2030-01-01", "2030-12-31"))
	assert.Equal(t, []string{"Enablers only"}, names, "a range without decks lists today's relevant packages")
}

func TestExplorer_TodayOnly(t *testing.T) {
	store, src := relevanceStore(t)
	usePool(t, types.Card{Name: "P1", Types: []string{"Creature"}})
	rr := serveCube(ExplorerHandler(store, src, nil), "/api/polyverse/stats/explorer", url.Values{"q": {"n:P1"}, "all": {"1"}})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp ExplorerResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.Len(t, resp.Candidates, 1)
	for _, j := range resp.Candidates[0].Joins {
		assert.NotEqual(t, "Lifegain", j.Package, "today's list can't support Lifegain")
	}

	require.NoError(t, store.PutOverrides(relevanceCube, design.PackageOverrides{On: []string{"Lifegain"}}))
	rr = serveCube(ExplorerHandler(store, src, nil), "/api/polyverse/stats/explorer", url.Values{"q": {"n:P1"}, "all": {"1"}})
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.Len(t, resp.Candidates, 1)
	require.NotEmpty(t, resp.Candidates[0].Joins, "forced on, it shows")
	assert.Equal(t, "Lifegain", resp.Candidates[0].Joins[0].Package)
}

func TestCardPage_RangeRelevance(t *testing.T) {
	store, src := relevanceStore(t)
	page := func(start, end string) CardPageResponse {
		rr := serveCube(CardPageHandler(store, store, src), "/api/polyverse/stats/card", url.Values{"name": {"E1"}, "start": {start}, "end": {end}})
		require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
		var resp CardPageResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		return resp
	}
	assert.Contains(t, page("2024-01-01", "2024-01-31").PackageNames, "Lifegain")
	assert.NotContains(t, page("2024-04-01", "2024-04-30").PackageNames, "Lifegain")
}

// graphPackages serves the design graph with the given params and returns
// the package names its edges carry.
func graphPackages(t *testing.T, params url.Values) map[string]bool {
	t.Helper()
	store, src := relevanceStore(t)
	rr := serveCube(DesignGraphHandler(store, src), "/api/polyverse/stats/design-graph", params)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp DesignGraphResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	out := map[string]bool{}
	for _, p := range resp.Packages {
		out[p.Name] = true
	}
	return out
}

func TestDesignGraph_DraftParam(t *testing.T) {
	assert.True(t, graphPackages(t, url.Values{"draft": {"1"}})["Lifegain"], "draft 1's list supported it")
	assert.False(t, graphPackages(t, url.Values{"draft": {"4"}})["Lifegain"], "draft 4's didn't")
	assert.True(t, graphPackages(t, url.Values{})["Lifegain"], "without a draft, every package, for the rules editor")
}

// TestDesignGraph_DeckParam checks that asking for one deck returns only the
// links among that deck's cards, with packages judged on its draft's list.
func TestDesignGraph_DeckParam(t *testing.T) {
	store, src := relevanceStore(t)
	rr := serveCube(DesignGraphHandler(store, src), "/api/polyverse/stats/design-graph", url.Values{"deck": {"1/1"}})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp DesignGraphResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))

	deck := map[string]bool{
		"E1": true,
		"E2": true,
		"P1": true,
		"P2": true,
	}
	require.NotEmpty(t, resp.Edges)
	for _, e := range resp.Edges {
		assert.True(t, deck[e.Source] && deck[e.Target], "edge %s-%s leaves the deck", e.Source, e.Target)
	}
	for _, n := range resp.Nodes {
		assert.True(t, deck[n.Name], "node %s isn't in the deck", n.Name)
	}
	assert.Empty(t, resp.GroupEdges, "the group graph is for the rules editor")
	assert.True(t, graphPackages(t, url.Values{"deck": {"1/1"}})["Lifegain"], "draft 1's list supported it")
	assert.False(t, graphPackages(t, url.Values{"deck": {"4/1"}})["Lifegain"], "draft 4's didn't")
}

func TestDesignGraph_BadDeckParam(t *testing.T) {
	store, src := relevanceStore(t)
	wantStatus := map[string]int{
		"x":   http.StatusBadRequest,
		"1/x": http.StatusBadRequest,
		"9/9": http.StatusNotFound,
	}
	for ref, code := range wantStatus {
		rr := serveCube(DesignGraphHandler(store, src), "/api/polyverse/stats/design-graph", url.Values{"deck": {ref}})
		assert.Equal(t, code, rr.Code, ref)
	}
}

func TestRulesBoard_MarksRelevance(t *testing.T) {
	store, src := relevanceStore(t)
	require.NoError(t, store.PutOverrides(relevanceCube, design.PackageOverrides{On: []string{"Lifegain"}}))
	rr := serveCube(RulesBoardHandler(store, src), "/api/polyverse/stats/rules-board", url.Values{})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp RulesBoardResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.Len(t, resp.Packages, 2, "the board lists every package")

	byName := map[string]BoardPackage{}
	for _, p := range resp.Packages {
		byName[p.Name] = p
	}
	assert.False(t, byName["Lifegain"].Relevant, "below the line on today's list")
	assert.Equal(t, "on", byName["Lifegain"].Forced)
	assert.True(t, byName["Enablers only"].Relevant)
	assert.Equal(t, "", byName["Enablers only"].Forced)
}

func TestPackagePage_MarksRelevance(t *testing.T) {
	store, src := relevanceStore(t)
	page := func(name string) PackagePageResponse {
		rr := serveCube(PackagePageHandler(store, src), "/api/polyverse/stats/package", url.Values{"name": {name}})
		require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
		var resp PackagePageResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		return resp
	}
	lifegain := page("Lifegain")
	assert.False(t, lifegain.Relevant, "a package page opens even below the line, and says so")
	assert.Equal(t, "", lifegain.Forced)

	require.NoError(t, store.PutOverrides(relevanceCube, design.PackageOverrides{Off: []string{"Enablers only"}}))
	enablers := page("Enablers only")
	assert.True(t, enablers.Relevant, "the line's verdict, before overrides")
	assert.Equal(t, "off", enablers.Forced)
}

// brokenRulesStore fails every rules read, like a malformed rules file.
type brokenRulesStore struct {
	mockDeckStorage
}

// GetRules fails with a read error.
func (brokenRulesStore) GetRules(string) (*design.DesignMapConfig, error) {
	return nil, errors.New("unexpected end of JSON input")
}

// TestDesignGraph_RulesReadFails checks that a rules file the server can't
// read is an error, not an empty rule set the editor would save over every
// cube's shared rules.
func TestDesignGraph_RulesReadFails(t *testing.T) {
	rr := serveCube(DesignGraphHandler(&brokenRulesStore{}, fixedCubeSource{cube: namedCards("E1")}), "/api/polyverse/stats/design-graph", url.Values{})
	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

// TestDesignGraph_NoRulesSupport keeps a store without rules serving an
// empty graph.
func TestDesignGraph_NoRulesSupport(t *testing.T) {
	rr := serveCube(DesignGraphHandler(&mockDeckStorage{}, fixedCubeSource{cube: namedCards("E1")}), "/api/polyverse/stats/design-graph", url.Values{})
	assert.Equal(t, http.StatusOK, rr.Code)
}

// TestPackagePage_HidesIrrelevantOthers checks that the package page names
// only packages shown over its range: Lifegain shares the Enablers group with
// Enablers only, but draft 4's list can't support it.
func TestPackagePage_HidesIrrelevantOthers(t *testing.T) {
	store, src := relevanceStore(t)
	page := func(start, end string) PackagePageResponse {
		rr := serveCube(PackagePageHandler(store, src), "/api/polyverse/stats/package", url.Values{"name": {"Enablers only"}, "start": {start}, "end": {end}})
		require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
		var resp PackagePageResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		return resp
	}
	others := func(resp PackagePageResponse) []string {
		var out []string
		for _, e := range resp.Related {
			out = append(out, e.Target)
		}
		for _, w := range resp.Wires {
			for _, g := range append(w.Sources, w.Targets...) {
				out = append(out, g.OtherPackages...)
			}
		}
		for _, g := range resp.Map.Groups {
			out = append(out, g.OtherPackages...)
		}
		return out
	}
	assert.Contains(t, others(page("2024-01-01", "2024-01-31")), "Lifegain", "draft 1's list supported it")
	assert.NotContains(t, others(page("2024-04-01", "2024-04-30")), "Lifegain", "draft 4's didn't")
}

// TestDesignGraph_NoLinksToUnplayedCutCards checks that a card only an old
// snapshot held, which no deck played, gets no links in the graph.
func TestDesignGraph_NoLinksToUnplayedCutCards(t *testing.T) {
	store, src := relevanceStore(t)
	rr := serveCube(DesignGraphHandler(store, src), "/api/polyverse/stats/design-graph", url.Values{})
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp DesignGraphResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	played := 0
	for _, e := range resp.Edges {
		assert.NotEqual(t, "P3", e.Source)
		assert.NotEqual(t, "P3", e.Target)
		if e.Source == "P1" || e.Target == "P1" {
			played++
		}
	}
	assert.NotZero(t, played, "a cut card a deck played keeps its links")
}
