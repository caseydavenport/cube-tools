package searchapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckHandlerAcceptsValidSearch(t *testing.T) {
	rec := httptest.NewRecorder()
	CheckHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/search/check?target=cards&q=t:creature", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"error":""}`, rec.Body.String())
}

func TestCheckHandlerReportsBadSearch(t *testing.T) {
	rec := httptest.NewRecorder()
	CheckHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/search/check?target=cards&q=nosuchkeyword:x", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.NotContains(t, rec.Body.String(), `"error":""`)
}

func TestCheckHandlerRejectsUnknownTarget(t *testing.T) {
	rec := httptest.NewRecorder()
	CheckHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/search/check?target=nonsense&q=x", nil))

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestKeywordsHandlerRejectsUnknownTarget(t *testing.T) {
	rec := httptest.NewRecorder()
	KeywordsHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/search/keywords?target=nonsense", nil))

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestKeywordsHandlerListsKeywords(t *testing.T) {
	rec := httptest.NewRecorder()
	KeywordsHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/search/keywords?target=cards", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	assert.NotEqual(t, "null", strings.TrimSpace(rec.Body.String()))
}

func TestHighlightHandlerRejectsBadBody(t *testing.T) {
	rec := httptest.NewRecorder()
	HighlightHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/search/highlight", strings.NewReader("{not json")))

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestHighlightHandlerReportsUnparsableSearch(t *testing.T) {
	body := `{"q":"nosuchkeyword:x","names":["Lightning Bolt"]}`
	rec := httptest.NewRecorder()
	HighlightHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/search/highlight", strings.NewReader(body)))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), `"names":[]`)
	assert.Contains(t, rec.Body.String(), `"error":`)
}
