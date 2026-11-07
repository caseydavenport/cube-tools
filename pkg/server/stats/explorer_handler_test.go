package stats

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// fixedCubeSource serves one cube for every cube id.
type fixedCubeSource struct {
	cube *types.Cube
}

// Current returns the source's cube.
func (s fixedCubeSource) Current(string) (*types.Cube, error) {
	return s.cube, nil
}

// Refresh returns the source's cube.
func (s fixedCubeSource) Refresh(string) (*types.Cube, error) {
	return s.cube, nil
}

// usePool swaps the explorer's card pool for the test's.
func usePool(t *testing.T, cards ...types.Card) {
	t.Helper()
	pool := make(map[string]types.Card, len(cards))
	for _, c := range cards {
		pool[c.Name] = c
	}
	old := explorerPoolFunc
	explorerPoolFunc = func() map[string]types.Card { return pool }
	t.Cleanup(func() { explorerPoolFunc = old })
}

// explorerFor serves the explorer over the explorer test cube and rules, with
// maybe as the maybeboard source.
func explorerFor(t *testing.T, maybe MaybeboardSource, params url.Values) ExplorerResponse {
	t.Helper()
	store := &rulesDeckStorage{config: explorerConfig()}
	rr := serveCube(ExplorerHandler(store, fixedCubeSource{cube: explorerCube()}, maybe), "/api/polyverse/stats/explorer", params)
	require.Equal(t, http.StatusOK, rr.Code)
	var resp ExplorerResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	return resp
}

// explorerPoolCards are a candidate outlet, a cube outlet and a card no group holds.
func explorerPoolCards() []types.Card {
	return []types.Card{
		{Name: "Candidate A", Types: []string{"Artifact"}, OracleText: outletText},
		explorerCube().Cards[0],
		{Name: "Plain Card", Types: []string{"Sorcery"}, OracleText: "Draw a card."},
	}
}

// names lists the cards' names.
func names(cards []ExplorerCard) []string {
	out := []string{}
	for _, c := range cards {
		out = append(out, c.Name)
	}
	return out
}

func TestExplorerHandler_EmptySearch(t *testing.T) {
	usePool(t, explorerPoolCards()...)

	// With no search, every card is scored, so the page can open on the best
	// fits; cards in no group still stay out.
	for _, q := range []string{"", "   "} {
		resp := explorerFor(t, nil, url.Values{"q": {q}})
		assert.Equal(t, []string{"Candidate A"}, names(resp.Candidates), "search %q", q)
		assert.Equal(t, []string{"Outlet A"}, names(resp.InCube), "search %q", q)
	}
}

func TestExplorerHandler_SplitsCubeCards(t *testing.T) {
	usePool(t, explorerPoolCards()...)

	resp := explorerFor(t, nil, url.Values{"q": {`o:"sacrifice a creature"`}})

	assert.Equal(t, []string{"Candidate A"}, names(resp.Candidates))
	assert.Equal(t, []string{"Outlet A"}, names(resp.InCube))
}

func TestExplorerHandler_NoGroupCardsHidden(t *testing.T) {
	usePool(t, explorerPoolCards()...)

	resp := explorerFor(t, nil, url.Values{"q": {`n:"Plain Card"`}})
	assert.Empty(t, resp.Candidates)

	resp = explorerFor(t, nil, url.Values{"q": {`n:"Plain Card"`}, "all": {"1"}})
	assert.Equal(t, []string{"Plain Card"}, names(resp.Candidates))
}

func TestExplorerHandler_MaybeboardFilter(t *testing.T) {
	usePool(t, explorerPoolCards()...)
	maybe := func(string) ([]string, error) { return []string{"Candidate A"}, nil }

	resp := explorerFor(t, maybe, url.Values{"maybe": {"1"}})

	assert.Equal(t, []string{"Candidate A"}, names(resp.Candidates))
	assert.Empty(t, resp.InCube)
	assert.True(t, resp.Maybeboard.Available)
}

func TestExplorerHandler_MaybeboardFails(t *testing.T) {
	usePool(t, explorerPoolCards()...)

	down := func(string) ([]string, error) { return nil, errors.New("cubecobra is down") }
	resp := explorerFor(t, down, url.Values{"q": {`o:"sacrifice a creature"`}, "maybe": {"1"}})
	assert.Equal(t, []string{"Candidate A"}, names(resp.Candidates))
	assert.True(t, resp.Maybeboard.Available)
	assert.NotEmpty(t, resp.Maybeboard.Error)

	none := func(string) ([]string, error) { return nil, cubes.ErrNoCubeCobra }
	resp = explorerFor(t, none, url.Values{"q": {`o:"sacrifice a creature"`}})
	assert.False(t, resp.Maybeboard.Available)
}

func TestCardPage_Connections(t *testing.T) {
	cube := explorerCube()
	odd := types.Card{
		Name:       "Odd Card",
		Types:      []string{"Artifact"},
		OracleText: "Sacrifice a creature: Search your library for a basic land card, then shuffle.",
	}
	cube.Cards = append(cube.Cards, odd)
	store := &rulesDeckStorage{config: explorerConfig()}

	rr := serveCube(CardPageHandler(store, noDraftLogs{}, fixedCubeSource{cube: cube}), "/api/polyverse/stats/card", url.Values{"name": {"Odd Card"}})
	require.Equal(t, http.StatusOK, rr.Code)
	var resp CardPageResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))

	assert.Equal(t, []PackageConnection{{A: "Ramp", B: "Sacrifice", Shared: 0}}, resp.Connections)
}

func TestExplorerHandler_KeepsCardEntryWithNoGroup(t *testing.T) {
	payoff := explorerCube().Cards[6]
	usePool(t, payoff)
	config := explorerConfig()
	config.Packages[0].Wires = append(config.Packages[0].Wires, design.Wire{Kind: design.WireEnables, Sources: []string{"Makers"}, Targets: []string{"card:Lone Payoff"}})
	store := &rulesDeckStorage{config: config}

	rr := serveCube(ExplorerHandler(store, fixedCubeSource{cube: explorerCube()}, nil), "/api/polyverse/stats/explorer", url.Values{"q": {`n:"Lone Payoff"`}})
	require.Equal(t, http.StatusOK, rr.Code)
	var resp ExplorerResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))

	assert.Equal(t, []string{"Lone Payoff"}, names(resp.InCube))
}

// sortPoolCards are three candidate outlets, named so A to Z order differs
// from the pool order.
func sortPoolCards() []types.Card {
	return []types.Card{
		{Name: "Outlet Zed", Types: []string{"Artifact"}, OracleText: outletText},
		{Name: "Outlet Amy", Types: []string{"Artifact"}, OracleText: outletText},
		{Name: "Outlet Mo", Types: []string{"Artifact"}, OracleText: outletText},
	}
}

func TestExplorerHandler_LimitKeepsTotals(t *testing.T) {
	usePool(t, sortPoolCards()...)

	resp := explorerFor(t, nil, url.Values{"q": {"o:sacrifice"}, "limit": {"1"}, "sort": {"name"}})
	assert.Equal(t, []string{"Outlet Amy"}, names(resp.Candidates))
	assert.Equal(t, 3, resp.CandidatesTotal)

	all := explorerFor(t, nil, url.Values{"q": {"o:sacrifice"}, "sort": {"name"}})
	assert.Equal(t, []string{"Outlet Amy", "Outlet Mo", "Outlet Zed"}, names(all.Candidates))
}

func TestExplorerHandler_SortDirection(t *testing.T) {
	usePool(t, sortPoolCards()...)

	resp := explorerFor(t, nil, url.Values{"q": {"o:sacrifice"}, "sort": {"name"}, "dir": {"desc"}})
	assert.Equal(t, []string{"Outlet Zed", "Outlet Mo", "Outlet Amy"}, names(resp.Candidates))

	// An unknown column sorts by Fills gaps; the three tie, so names break it.
	fallback := explorerFor(t, nil, url.Values{"q": {"o:sacrifice"}, "sort": {"bogus"}})
	assert.Equal(t, []string{"Outlet Amy", "Outlet Mo", "Outlet Zed"}, names(fallback.Candidates))
}

func TestLinkedCountCountsBasics(t *testing.T) {
	assert.Equal(t, 2, linkedCount(ExplorerCard{Linked: []string{"A", "B"}}))
	assert.Equal(t, 3, linkedCount(ExplorerCard{Linked: []string{"A", "B"}, LinkedBasics: true}))
	assert.Equal(t, 1, linkedCount(ExplorerCard{LinkedBasics: true}))
}
