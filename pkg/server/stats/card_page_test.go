package stats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// noDraftLogs is a DraftLogReader for a cube that keeps no pick logs.
type noDraftLogs struct{}

// GetDraftLog reports that no draft has a log.
func (noDraftLogs) GetDraftLog(_ string, _ int) (json.RawMessage, error) {
	return nil, storage.ErrUnsupported
}

// rulesDeckStorage is a mockDeckStorage that also has rules.
type rulesDeckStorage struct {
	mockDeckStorage
	config design.DesignMapConfig
}

// GetRules returns the store's rules.
func (s *rulesDeckStorage) GetRules(_ string) (*design.DesignMapConfig, error) {
	return &s.config, nil
}

// GetOverrides forces every package in the store's rules on, so tests built
// on fixtures too small to clear the relevance line still see their packages.
func (s *rulesDeckStorage) GetOverrides(_ string) (design.PackageOverrides, error) {
	ov := design.PackageOverrides{}
	for _, p := range s.config.Packages {
		ov.On = append(ov.On, p.Name)
	}
	return ov, nil
}

// serveCube serves a request for the polyverse test cube and returns the
// recorded response.
func serveCube(h http.Handler, path string, params url.Values) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path+"?"+params.Encode(), nil)
	req = req.WithContext(server.ContextWithCube(context.Background(), "polyverse"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

// cardPageFor serves the card page for name over decks and decodes it.
func cardPageFor(t *testing.T, store storage.DeckStorage, params url.Values) (*httptest.ResponseRecorder, CardPageResponse) {
	t.Helper()
	rr := serveCube(CardPageHandler(store, noDraftLogs{}, testCubeSource{}), "/api/polyverse/stats/card", params)
	var resp CardPageResponse
	if rr.Code == http.StatusOK {
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	}
	return rr, resp
}

func TestCardPage_CubeCard(t *testing.T) {
	decks := []*storage.Deck{
		playDeck("Freddie", 1, 1, "2024-01-01", "Goblin Bombardment"),
		playDeck("Ozzy", 1, 2, "2024-01-01", "Goblin Bombardment"),
		playDeck("Joan", 1, 3, "2024-01-01", "Shock"),
	}
	rr, resp := cardPageFor(t, &mockDeckStorage{decks: decks}, url.Values{"name": {"Goblin Bombardment"}})

	require.Equal(t, http.StatusOK, rr.Code)
	assert.True(t, resp.InCube)
	assert.Equal(t, 1, resp.Copies)
	assert.Equal(t, "Goblin Bombardment", resp.Card.Name)
	assert.Equal(t, 2, resp.Play.Mainboard)
	assert.Len(t, resp.Decks, 2)
	assert.Equal(t, []DraftPresence{{DraftID: 1, Date: "2024-01-01", State: "played", InRange: true}}, resp.History)
}

func TestCardPage_UnknownName(t *testing.T) {
	rr, _ := cardPageFor(t, &mockDeckStorage{}, url.Values{"name": {"Not A Card"}})
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCardPage_CutCard(t *testing.T) {
	seedOracle(t, `[
		{"name":"Cut Test Card","type_line":"Instant","oracle_text":"Draw a card.","colors":["U"],"cmc":1}
	]`)
	decks := []*storage.Deck{playDeck("Freddie", 1, 1, "2024-01-01", "Cut Test Card")}
	rr, resp := cardPageFor(t, &mockDeckStorage{decks: decks}, url.Values{"name": {"Cut Test Card"}})

	require.Equal(t, http.StatusOK, rr.Code)
	assert.False(t, resp.InCube)
	assert.Equal(t, 0, resp.Copies)
	require.Len(t, resp.History, 1)
	assert.Equal(t, "played", resp.History[0].State)
}

func TestCardPage_IgnoresDeckFilter(t *testing.T) {
	decks := []*storage.Deck{
		playDeck("Freddie", 1, 1, "2024-01-01", "Goblin Bombardment"),
		playDeck("Ozzy", 1, 2, "2024-01-01", "Goblin Bombardment"),
	}
	store := &playerFilterStore{mockDeckStorage{decks: decks}}

	plain := serveCube(CardPageHandler(store, noDraftLogs{}, testCubeSource{}), "/api/polyverse/stats/card", url.Values{"name": {"Goblin Bombardment"}})
	filtered := serveCube(CardPageHandler(store, noDraftLogs{}, testCubeSource{}), "/api/polyverse/stats/card", url.Values{"name": {"Goblin Bombardment"}, "match": {`player:"Ozzy"`}})
	require.Equal(t, http.StatusOK, plain.Code)
	assert.Equal(t, plain.Body.String(), filtered.Body.String())
	assert.Contains(t, plain.Body.String(), `"mainboard":2`)
}

func TestCardPage_EmptyListsNotNull(t *testing.T) {
	rr, _ := cardPageFor(t, &mockDeckStorage{}, url.Values{"name": {"Goblin Bombardment"}})
	require.Equal(t, http.StatusOK, rr.Code)

	body := rr.Body.String()
	assert.NotContains(t, body, "null")
	for _, field := range []string{"groups", "history", "partners", "same_role", "deck_colors", "archetypes", "players", "decks", "picks", "answered_by", "removal", "package_names"} {
		assert.Contains(t, body, `"`+field+`":[`, field)
	}
}

func TestCardCompare_Links(t *testing.T) {
	store := &rulesDeckStorage{config: design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Bombardment", Conditions: []string{`n:"Goblin Bombardment"`}},
			{Name: "Burn", Conditions: []string{`n:"Lightning Bolt"`}},
		},
		Packages: []design.Package{{Name: "Damage", Wires: []design.Wire{{Sources: []string{"Bombardment"}, Targets: []string{"Burn"}}}}},
	}}
	h := CardCompareHandler(store, testCubeSource{})

	rr := serveCube(h, "/api/polyverse/stats/card-compare", url.Values{"a": {"Goblin Bombardment"}, "b": {"Lightning Bolt"}})
	require.Equal(t, http.StatusOK, rr.Code)
	var resp CardCompareResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, []CardBridge{{Package: "Damage", Group: "Bombardment", OtherGroup: "Burn"}}, resp.Links)

	unknown := serveCube(h, "/api/polyverse/stats/card-compare", url.Values{"a": {"Goblin Bombardment"}, "b": {"Not A Card"}})
	require.Equal(t, http.StatusOK, unknown.Code)
	assert.JSONEq(t, `{"links":[]}`, unknown.Body.String())
}

func TestCardPage_PackageNamesSortedLikeTheRulesEditor(t *testing.T) {
	store := &rulesDeckStorage{config: design.DesignMapConfig{
		Packages: []design.Package{{Name: "tokens"}, {Name: "Aggro"}, {Name: "Sacrifice"}},
	}}
	rr, resp := cardPageFor(t, store, url.Values{"name": {"Goblin Bombardment"}})
	require.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, []string{"Aggro", "Sacrifice", "tokens"}, resp.PackageNames)
}
