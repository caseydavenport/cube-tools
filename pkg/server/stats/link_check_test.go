package stats

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// linkCheckFor serves the link check for a and b over sacrificeRules and
// decodes it on success.
func linkCheckFor(t *testing.T, a, b string) (string, int, LinkCheckResponse) {
	t.Helper()
	store := &rulesDeckStorage{config: sacrificeRules("Sacrifice")}
	rr := serveCube(LinkCheckHandler(store, testCubeSource{}), "/api/polyverse/stats/link-check", url.Values{"a": {a}, "b": {b}})
	var resp LinkCheckResponse
	if rr.Code == http.StatusOK {
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	}
	return rr.Body.String(), rr.Code, resp
}

func TestLinkCheck_Linked(t *testing.T) {
	_, code, resp := linkCheckFor(t, "Goblin Bombardment", "Mayhem Devil")
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, []LinkedWire{{
		Package:  "Sacrifice",
		Wire:     0,
		GroupA:   "Outlets",
		GroupB:   "Payoffs",
		MatchedA: `n:"Goblin Bombardment"`,
		MatchedB: `n:"Mayhem Devil"`,
	}}, resp.Links)
}

func TestLinkCheck_LinkedEitherOrder(t *testing.T) {
	_, _, resp := linkCheckFor(t, "Mayhem Devil", "Goblin Bombardment")
	require.Len(t, resp.Links, 1)
	assert.Equal(t, "Payoffs", resp.Links[0].GroupA)
	assert.Equal(t, "Outlets", resp.Links[0].GroupB)
}

func TestLinkCheck_SameSideNotLinked(t *testing.T) {
	_, code, resp := linkCheckFor(t, "Mayhem Devil", "Grim Lavamancer")
	require.Equal(t, http.StatusOK, code)
	assert.Empty(t, resp.Links)
	assert.Equal(t, []GroupUses{{
		Group: "Fodder",
		Uses: []WireUse{
			{Package: "Burn", Wire: 0, Side: "sources"},
			{Package: "Sacrifice", Wire: 0, Side: "targets"},
		},
	}}, resp.B.Groups)
}

func TestLinkCheck_CardEntryThread(t *testing.T) {
	_, _, resp := linkCheckFor(t, "Grim Lavamancer", "Lightning Bolt")
	require.Len(t, resp.Links, 1)
	assert.Equal(t, "card:Lightning Bolt", resp.Links[0].GroupB)
	assert.Equal(t, "", resp.Links[0].MatchedB)
}

func TestLinkCheck_CardInNoGroups(t *testing.T) {
	body, code, resp := linkCheckFor(t, "Goblin Bombardment", "Lightning Bolt")
	require.Equal(t, http.StatusOK, code)
	assert.Empty(t, resp.B.Groups)
	assert.Empty(t, resp.Links)
	assert.NotContains(t, body, "null")
}

func TestLinkCheck_UnknownCard(t *testing.T) {
	_, code, _ := linkCheckFor(t, "Goblin Bombardment", "Not A Card")
	assert.Equal(t, http.StatusNotFound, code)
}
