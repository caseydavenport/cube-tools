package stats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// cleanCreature is a creature card with no sacrifice text.
var cleanCreature = types.Card{Name: "Grizzly Bears", Types: []string{"Creature"}, OracleText: "Just a bear."}

// artifactCreature is an artifact creature card.
var artifactCreature = types.Card{Name: "Ornithopter", Types: []string{"Artifact", "Creature"}, OracleText: "Flying"}

func TestConditionParts_AndTerms(t *testing.T) {
	got := explainCondition(cleanCreature, `t:creature o:"sacrifice"`)
	assert.False(t, got.Matched)
	assert.Equal(t, []ConditionPart{
		{Text: "t:creature", Matched: true},
		{Text: "o:sacrifice", Matched: false},
	}, got.Parts)

	quoted := explainCondition(cleanCreature, `o:"sacrifice a creature"`)
	assert.Equal(t, `o:"sacrifice a creature"`, quoted.Parts[0].Text)
}

func TestConditionParts_Nested(t *testing.T) {
	got := explainCondition(artifactCreature, `(t:enchantment OR t:artifact) -t:creature`)
	assert.False(t, got.Matched)
	assert.Equal(t, []ConditionPart{
		{Text: "(t:enchantment or t:artifact)", Matched: true},
		{Text: "-t:creature", Matched: false},
	}, got.Parts)
}

func TestConditionParts_SingleTerm(t *testing.T) {
	got := explainCondition(cleanCreature, "t:creature")
	assert.True(t, got.Matched)
	assert.Equal(t, []ConditionPart{{Text: "t:creature", Matched: true}}, got.Parts)
}

func TestCheckGroup_InGroup(t *testing.T) {
	group := design.Group{Name: "Creatures", Conditions: []string{"t:enchantment", "t:creature"}}
	got := checkGroup(cleanCreature, group)
	assert.True(t, got.InGroup)
	assert.False(t, got.Excluded)
	require.Len(t, got.Conditions, 2)
	assert.False(t, got.Conditions[0].Matched)
	assert.True(t, got.Conditions[1].Matched)
}

func TestCheckGroup_ExcludedByName(t *testing.T) {
	group := design.Group{Name: "Creatures", Conditions: []string{"t:creature"}, Exclude: []string{"Grizzly Bears"}}
	got := checkGroup(cleanCreature, group)
	assert.False(t, got.InGroup)
	assert.True(t, got.Excluded)
}

func TestGroupCheck_UnknownCard(t *testing.T) {
	body := `{"group":{"name":"Creatures","conditions":["t:creature"]},"card":"Not A Card"}`
	rr := serveCubePost(GroupCheckHandler(testCubeSource{}), "/api/polyverse/stats/group-check", body)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestGroupCheck_CubeCard(t *testing.T) {
	body := `{"group":{"name":"Outlets","conditions":["o:\"sacrifice a creature\""]},"card":"Goblin Bombardment"}`
	rr := serveCubePost(GroupCheckHandler(testCubeSource{}), "/api/polyverse/stats/group-check", body)
	require.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), `"in_group":true`)
}

// serveCubePost serves a JSON POST for the polyverse test cube.
func serveCubePost(h http.Handler, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req = req.WithContext(server.ContextWithCube(context.Background(), "polyverse"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}
