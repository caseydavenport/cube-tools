package stats

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// loadFixtureTags loads the types package's four test tags: removal, its child
// removal-creature, mill-self, and the hidden cycle.
func loadFixtureTags(t *testing.T) {
	t.Helper()
	require.NoError(t, types.LoadOracleTags("../../types/testdata/oracle-tags.jsonl"))
}

// cardsTagged returns n cards carrying the given tags.
func cardsTagged(n int, tags ...string) []types.Card {
	var cards []types.Card
	for range n {
		cards = append(cards, types.Card{Name: "card", OracleTags: tags})
	}
	return cards
}

// tagSlugs lists the slugs of rows, in order.
func tagSlugs(rows []TagRow) []string {
	var slugs []string
	for _, row := range rows {
		slugs = append(slugs, row.Slug)
	}
	return slugs
}

func TestTagRows_CountsAndOrder(t *testing.T) {
	loadFixtureTags(t)
	cards := append(cardsTagged(2, "cycle", "removal", "removal-creature"), cardsTagged(1, "mill-self")...)

	resp := tagRows(cards, 1000)
	assert.Equal(t, 3, resp.Total)
	assert.Equal(t, []string{"removal", "removal-creature", "mill-self"}, tagSlugs(resp.Tags), "cycle is hidden")
	assert.Equal(t, 2, resp.Tags[0].Cards)
	assert.Equal(t, "Cards that remove permanents.", resp.Tags[0].Description)
}

func TestTagRows_DistinctiveFloor(t *testing.T) {
	loadFixtureTags(t)
	cards := append(cardsTagged(8, "mill-self"), cardsTagged(7, "removal", "removal-creature")...)

	resp := tagRows(cards, 1000)
	require.Equal(t, []string{"mill-self"}, tagSlugs(resp.Distinctive), "removal is on 7 cards, under the floor of 8")

	// mill-self is on 8 of 15 cube cards and 1 of 1000 oracle cards.
	assert.InDelta(t, (8.0/15)/(1.0/1000), resp.Distinctive[0].Lift, 0.001)
}

func TestTagRows_SmallCube(t *testing.T) {
	loadFixtureTags(t)

	resp := tagRows(nil, 0)
	assert.Equal(t, 0, resp.Total)
	assert.Empty(t, resp.Tags)
	assert.Empty(t, resp.Distinctive)
	_, err := json.Marshal(resp)
	require.NoError(t, err)

	// With no oracle total there is no baseline, so lift reads 0, not NaN.
	resp = tagRows(cardsTagged(8, "mill-self"), 0)
	require.Len(t, resp.Distinctive, 1)
	assert.Zero(t, resp.Distinctive[0].Lift)
}

func TestTagsHandler(t *testing.T) {
	loadFixtureTags(t)

	rec := serve(t, TagsHandler(stubCubes{}), http.MethodGet, "/api/testcube/stats/tags", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var resp TagsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, len(stubCube().Cards), resp.Total)
}
