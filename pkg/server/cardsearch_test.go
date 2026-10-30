package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCardSearch_ShortQueryEmpty(t *testing.T) {
	rr := httptest.NewRecorder()
	CardSearchHandler().ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/polyverse/cards/search?q=b", nil))

	require.Equal(t, http.StatusOK, rr.Code)
	assert.JSONEq(t, `{"names":[]}`, rr.Body.String())
}

func TestCardSearch_NoMatchIsEmptyList(t *testing.T) {
	rr := httptest.NewRecorder()
	CardSearchHandler().ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/polyverse/cards/search?q=zz-no-such-card", nil))

	require.Equal(t, http.StatusOK, rr.Code)
	assert.JSONEq(t, `{"names":[]}`, rr.Body.String())
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
}
