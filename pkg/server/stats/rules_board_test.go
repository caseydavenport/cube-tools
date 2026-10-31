package stats

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
)

// rulesBoardFor serves the rules board over config and sacrificeDecks, and
// decodes it.
func rulesBoardFor(t *testing.T, config design.DesignMapConfig) (string, RulesBoardResponse) {
	t.Helper()
	store := &rulesDeckStorage{mockDeckStorage: mockDeckStorage{decks: sacrificeDecks()}, config: config}
	rr := serveCube(RulesBoardHandler(store, testCubeSource{}), "/api/polyverse/stats/rules-board", url.Values{})
	require.Equal(t, http.StatusOK, rr.Code)
	var resp RulesBoardResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	return rr.Body.String(), resp
}

// boardPackage finds the named package on the board.
func boardPackage(t *testing.T, resp RulesBoardResponse, name string) BoardPackage {
	t.Helper()
	for _, p := range resp.Packages {
		if p.Name == name {
			return p
		}
	}
	require.FailNow(t, "no package named "+name)
	return BoardPackage{}
}

func TestRulesBoard_Packages(t *testing.T) {
	config := sacrificeRules("Sacrifice")
	_, resp := rulesBoardFor(t, config)

	require.Len(t, resp.Packages, 2)
	assert.Equal(t, "Sacrifice", resp.Packages[0].Name)
	assert.Equal(t, "Burn", resp.Packages[1].Name)

	sac := resp.Packages[0]
	assert.Equal(t, config.Packages[0].Wires, sac.Wires)
	var names []string
	for _, g := range sac.Groups {
		names = append(names, g.Name)
	}
	assert.Equal(t, []string{"Outlets", "Payoffs", "Fodder"}, names)
	assert.Equal(t, 2, sac.Stat.Package)
	assert.Equal(t, []string{"Burn"}, sac.SharesWith)
	assert.Equal(t, 3, sac.Colors["R"])
}

func TestRulesBoard_OneCardGroups(t *testing.T) {
	_, resp := rulesBoardFor(t, sacrificeRules("Sacrifice"))
	assert.Equal(t, []string{"Outlets", "Payoffs", "Fodder"}, boardPackage(t, resp, "Sacrifice").OneCardGroups)
	assert.Equal(t, []string{"Fodder"}, boardPackage(t, resp, "Burn").OneCardGroups)
}

func TestRulesBoard_UnusedGroups(t *testing.T) {
	config := sacrificeRules("Sacrifice")
	config.Groups = append(config.Groups, design.Group{Name: "Spare", Conditions: []string{`n:"Counterspell"`}})

	_, resp := rulesBoardFor(t, config)
	assert.Equal(t, []BoardGroup{{Name: "Spare", Cards: []string{"Counterspell"}}}, resp.UnusedGroups)
}

func TestRulesBoard_NoNulls(t *testing.T) {
	body, resp := rulesBoardFor(t, design.DesignMapConfig{})
	assert.Empty(t, resp.Packages)
	assert.NotContains(t, body, "null")
}
