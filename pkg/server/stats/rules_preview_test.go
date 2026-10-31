package stats

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// previewFor posts a proposed rule set to the preview over sacrificeRules
// and one deck that builds Sacrifice, and decodes the answer on success.
func previewFor(t *testing.T, body string) (int, RulesPreviewResponse) {
	t.Helper()
	decks := []*storage.Deck{playDeck("Freddie", 1, 1, "2024-01-01", "Goblin Bombardment", "Mayhem Devil", "Grim Lavamancer")}
	store := &rulesDeckStorage{mockDeckStorage: mockDeckStorage{decks: decks}, config: sacrificeRules("Sacrifice")}
	rr := serveCubePost(RulesPreviewHandler(store, testCubeSource{}), "/api/polyverse/stats/rules-preview", body)
	var resp RulesPreviewResponse
	if rr.Code == http.StatusOK {
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	}
	return rr.Code, resp
}

// proposal encodes a rule set as a preview request body.
func proposal(t *testing.T, config design.DesignMapConfig) string {
	t.Helper()
	b, err := json.Marshal(config)
	require.NoError(t, err)
	return string(b)
}

func TestRulesPreview_OnlyChanged(t *testing.T) {
	config := sacrificeRules("Sacrifice")
	config.Packages[0].Wires[0].Targets = []string{"Payoffs"}

	code, resp := previewFor(t, proposal(t, config))
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, []PackageChange{{Name: "Sacrifice", Now: 1, After: 0}}, resp.Packages)
}

func TestRulesPreview_NewPackage(t *testing.T) {
	config := sacrificeRules("Sacrifice")
	config.Packages = append(config.Packages, design.Package{
		Name:  "Combo",
		Wires: []design.Wire{{Sources: []string{"Outlets"}, Targets: []string{"Payoffs", "Fodder"}}},
	})

	_, resp := previewFor(t, proposal(t, config))
	assert.Equal(t, []PackageChange{{Name: "Combo", Now: 0, After: 1}}, resp.Packages)
}

func TestRulesPreview_NoChange(t *testing.T) {
	_, resp := previewFor(t, proposal(t, sacrificeRules("Sacrifice")))
	assert.NotNil(t, resp.Packages)
	assert.Empty(t, resp.Packages)
}

func TestRulesPreview_BadBody(t *testing.T) {
	code, _ := previewFor(t, "{not json")
	assert.Equal(t, http.StatusBadRequest, code)
}
