package stats

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// sacrificeRules is a one-package rule set over real polyverse cards:
// Goblin Bombardment wired to Mayhem Devil and Grim Lavamancer.
func sacrificeRules(name string) design.DesignMapConfig {
	return design.DesignMapConfig{
		Groups: []design.Group{
			{Name: "Outlets", Conditions: []string{`n:"Goblin Bombardment"`}},
			{Name: "Payoffs", Conditions: []string{`n:"Mayhem Devil"`}},
			{Name: "Fodder", Conditions: []string{`n:"Grim Lavamancer"`}},
		},
		Packages: []design.Package{
			{Name: name, Wires: []design.Wire{{Sources: []string{"Outlets"}, Targets: []string{"Payoffs", "Fodder"}}}},
			{Name: "Burn", Wires: []design.Wire{{Sources: []string{"Fodder"}, Targets: []string{"card:Lightning Bolt"}}}},
		},
	}
}

// sacrificeDecks are three decks in two drafts: two build the package, one
// doesn't.
func sacrificeDecks() []*storage.Deck {
	return []*storage.Deck{
		playDeck("Freddie", 1, 1, "2024-01-01", "Goblin Bombardment", "Mayhem Devil", "Grim Lavamancer"),
		playDeck("Ozzy", 1, 2, "2024-01-01", "Lightning Bolt"),
		playDeck("Ozzy", 2, 1, "2024-02-01", "Goblin Bombardment", "Mayhem Devil", "Grim Lavamancer"),
	}
}

// rulesFilterStore has rules and, like playerFilterStore, answers a filtered
// request with Freddie's decks only.
type rulesFilterStore struct {
	playerFilterStore
	config design.DesignMapConfig
}

// GetRules returns the store's rules.
func (s *rulesFilterStore) GetRules(_ string) (*design.DesignMapConfig, error) {
	return &s.config, nil
}

// packagePageFor serves the package page and decodes it on success.
func packagePageFor(t *testing.T, store storage.DeckStorage, params url.Values) (string, int, PackagePageResponse) {
	t.Helper()
	rr := serveCube(PackagePageHandler(store, testCubeSource{}), "/api/polyverse/stats/package", params)
	var resp PackagePageResponse
	if rr.Code == http.StatusOK {
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	}
	return rr.Body.String(), rr.Code, resp
}

func TestPackagePage_Header(t *testing.T) {
	store := &rulesDeckStorage{mockDeckStorage: mockDeckStorage{decks: sacrificeDecks()}, config: sacrificeRules("Sacrifice")}
	_, code, resp := packagePageFor(t, store, url.Values{"name": {"Sacrifice"}})

	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, "Sacrifice", resp.Name)
	assert.Equal(t, 2, resp.Stat.Package)
	assert.Equal(t, 0.667, resp.Stat.BuildRate)
	assert.Equal(t, 3, resp.Stat.CardCount)
	assert.Equal(t, "R", resp.Stat.Color)
	require.Len(t, resp.Decks, 2)
	assert.Equal(t, "2/1", resp.Decks[0].Ref)
	assert.Equal(t, []PackageEdge{{Source: "Sacrifice", Target: "Burn", Groups: []string{"Fodder"}}}, resp.Related)
}

func TestPackagePage_IgnoresDeckFilter(t *testing.T) {
	store := &rulesFilterStore{playerFilterStore: playerFilterStore{mockDeckStorage{decks: sacrificeDecks()}}, config: sacrificeRules("Sacrifice")}
	plain, _, _ := packagePageFor(t, store, url.Values{"name": {"Sacrifice"}})
	filtered, _, _ := packagePageFor(t, store, url.Values{"name": {"Sacrifice"}, "match": {`player:"Freddie"`}})
	assert.Equal(t, plain, filtered)
}

func TestPackagePage_UnknownName(t *testing.T) {
	store := &rulesDeckStorage{config: sacrificeRules("Sacrifice")}
	body, code, _ := packagePageFor(t, store, url.Values{"name": {"Not A Package"}})
	assert.Equal(t, http.StatusNotFound, code)
	assert.Contains(t, body, "unknown package")
}

func TestPackagePage_NameWithSlash(t *testing.T) {
	store := &rulesDeckStorage{config: sacrificeRules("Auras/Equipment")}
	_, code, resp := packagePageFor(t, store, url.Values{"name": {"auras/equipment"}})
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, "Auras/Equipment", resp.Name)
}

func TestPackagePage_EmptyListsNotNull(t *testing.T) {
	store := &rulesDeckStorage{config: sacrificeRules("Sacrifice")}
	body, code, _ := packagePageFor(t, store, url.Values{"name": {"Sacrifice"}})
	require.Equal(t, http.StatusOK, code)
	assert.NotContains(t, body, "null")
	for _, field := range []string{"wires", "color_table", "over_time", "decks", "related"} {
		assert.Contains(t, body, `"`+field+`":[`, field)
	}
}

func TestPackageWires_CardRef(t *testing.T) {
	config := sacrificeRules("Sacrifice")
	groups := map[string]map[string]bool{
		"Outlets":             cardSet("Goblin Bombardment"),
		"Payoffs":             cardSet("Mayhem Devil"),
		"Fodder":              cardSet("Grim Lavamancer"),
		"card:Lightning Bolt": cardSet("Lightning Bolt"),
	}

	burn := packageWires(config.Packages[1], groups, config)
	require.Len(t, burn, 1)
	assert.Equal(t, []WireGroup{{Name: "Lightning Bolt", Cards: []string{"Lightning Bolt"}, OtherPackages: []string{}}}, burn[0].Targets)
	assert.Equal(t, []WireGroup{{Name: "Fodder", Cards: []string{"Grim Lavamancer"}, OtherPackages: []string{"Sacrifice"}}}, burn[0].Sources)
}

func TestColorTable_CountsAndThin(t *testing.T) {
	cards := map[string]types.Card{}
	var source, target []string
	for i := range 4 {
		name := fmt.Sprintf("Red %d", i)
		cards[name] = tendencySpell(name, "R")
		source = append(source, name)
	}
	cards["Terminate"] = tendencySpell("Terminate", "B", "R")
	source = append(source, "Terminate")
	for i := range 5 {
		name := fmt.Sprintf("Black %d", i)
		cards[name] = tendencySpell(name, "B")
		target = append(target, name)
	}
	cards["Sol Ring"] = tendencySpell("Sol Ring")
	cards["Mire"] = types.Card{Name: "Mire", Types: []string{"Land"}}
	target = append(target, "Sol Ring", "Mire")

	wires := []PackageWire{{
		Sources: []WireGroup{{Name: "Burn", Cards: source}},
		Targets: []WireGroup{{Name: "Removal", Cards: target}},
	}}
	got := colorTable(wires, cards)
	require.Len(t, got, 2)

	assert.Equal(t, "Burn", got[0].Group)
	assert.Equal(t, "source", got[0].Side)
	assert.Equal(t, 5, got[0].Counts["R"])
	assert.Equal(t, 1, got[0].Counts["B"])
	assert.Equal(t, []string{"B"}, got[0].Thin)

	assert.Equal(t, "target", got[1].Side)
	assert.Equal(t, 5, got[1].Counts["B"])
	assert.Equal(t, 1, got[1].Counts["C"])
	assert.Equal(t, 1, got[1].Counts["L"])
	assert.Equal(t, []string{"R"}, got[1].Thin)
}

func TestPackageOverTime_MarksRange(t *testing.T) {
	pkg := twoSided("Graveyard", cardSet("gy1", "gy2"), cardSet("gy3", "gy4"))
	var decks []*storage.Deck
	for draft := 1; draft <= 8; draft++ {
		d := deckOf("x1")
		if draft == 1 || draft == 8 {
			d = deckOf("gy1", "gy2", "gy3", "gy4")
		}
		d.Metadata.DraftID = draft
		d.Date = fmt.Sprintf("2024-0%d-01", draft)
		decks = append(decks, d)
	}

	got := packageOverTime(pkg, decks, "2024-06-01", "")
	require.Len(t, got, 8)
	assert.False(t, got[0].InRange)
	assert.False(t, got[4].InRange)
	assert.True(t, got[5].InRange)
	assert.Equal(t, 1, got[0].Built)
	assert.Equal(t, 100.0, got[0].Smoothed)
	assert.Equal(t, 20.0, got[7].Smoothed)
	assert.Equal(t, 1, got[7].Decks)
}
