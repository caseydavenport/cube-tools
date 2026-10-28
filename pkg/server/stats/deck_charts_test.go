package stats

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// getDeckCharts serves a deck-charts request over decks and returns the
// recorder.
func getDeckCharts(decks []*storage.Deck) *httptest.ResponseRecorder {
	h := DeckChartsHandler(&mockDeckStorage{decks: decks}, testCubeSource{})
	req := httptest.NewRequest(http.MethodGet, "/api/polyverse/stats/deck-charts", nil)
	req.SetPathValue("cube", "polyverse")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestDeckChartsHandler_NoDecks(t *testing.T) {
	rec := getDeckCharts(nil)
	require.Equal(t, http.StatusOK, rec.Code)

	body := rec.Body.String()
	assert.Contains(t, body, `"forest":[`)
	assert.Contains(t, body, `"splash":[`)
	assert.Contains(t, body, `"close_matches":[`)
	assert.NotContains(t, body, "null")
}

func TestDeckChartsHandler_Shape(t *testing.T) {
	ozzy := gameDeck("Ozzy", creatures(5), won("Stevie", "Ozzy"))
	stevie := gameDeck("Stevie", creatures(2), won("Ozzy", "Ozzy"))
	rec := getDeckCharts([]*storage.Deck{ozzy, stevie})
	require.Equal(t, http.StatusOK, rec.Code)

	var resp DeckChartsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Len(t, resp.HeadToHead, 3)
	assert.Contains(t, resp.HeadToHead, "avg_mana_value")
	assert.Contains(t, resp.HeadToHead, "creatures")
	assert.Contains(t, resp.HeadToHead, "interaction")
	assert.Equal(t, 1, gapBucket(t, resp.HeadToHead["creatures"], "3").Wins)
	assert.Len(t, resp.Forest, 15)
	assert.Len(t, resp.CloseMatches, 3)
	assert.Len(t, resp.ManaCurve, 3)
	assert.Len(t, resp.TypeMix, 3)
	assert.Len(t, resp.Splash, 5)
}
