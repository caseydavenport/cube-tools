package commands

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFetchCubeCobraELO(t *testing.T) {
	const body = `{
		"cards": {
			"mainboard": [
				{"details": {"name": "Brainstorm", "elo": 1456.7}},
				{"details": {"name": "Lightning Bolt", "elo": 1602.2}},
				{"details": {"name": "", "elo": 1300}}
			],
			"maybeboard": [
				{"details": {"name": "Counterspell", "elo": 1399.4}},
				{"details": {"name": "Brainstorm", "elo": 1111.1}}
			]
		}
	}`

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/cube/api/cubeJSON/polyversal", r.URL.Path)
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	elo, err := fetchCubeCobraELO(srv.URL, "polyversal")
	require.NoError(t, err)

	// Rounded, both boards merged, blank names skipped.
	assert.Equal(t, 1457, elo["Brainstorm"]) // mainboard wins over maybeboard's 1111
	assert.Equal(t, 1602, elo["Lightning Bolt"])
	assert.Equal(t, 1399, elo["Counterspell"])
	_, blankPresent := elo[""]
	assert.False(t, blankPresent)
}

func TestFetchCubeCobraELO_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	_, err := fetchCubeCobraELO(srv.URL, "missing")
	assert.Error(t, err)
}
