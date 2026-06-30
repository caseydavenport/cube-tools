package commands

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFetchCubeCobraCards(t *testing.T) {
	const body = `{
		"cards": {
			"mainboard": [
				{"details": {"name": "Brainstorm", "elo": 1456.7, "image_normal": "https://img/bs-main.jpg", "scryfall_uri": "https://scryfall.com/card/ice/61/brainstorm"}},
				{"details": {"name": "Lightning Bolt", "elo": 1602.2, "image_normal": "https://img/bolt.jpg"}},
				{"details": {"name": "", "elo": 1300}}
			],
			"maybeboard": [
				{"details": {"name": "Counterspell", "elo": 1399.4}},
				{"details": {"name": "Brainstorm", "elo": 1111.1, "image_normal": "https://img/bs-maybe.jpg"}}
			]
		}
	}`

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/cube/api/cubeJSON/polyversal", r.URL.Path)
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	cards, err := fetchCubeCobraCards(srv.URL, "polyversal")
	require.NoError(t, err)

	// Rounded, both boards merged, blank names skipped. Mainboard wins over the
	// maybeboard entry, so we keep the mainboard Elo and printing.
	assert.Equal(t, 1457, cards["Brainstorm"].elo)
	assert.Equal(t, "https://img/bs-main.jpg", cards["Brainstorm"].image)
	assert.Equal(t, "https://scryfall.com/card/ice/61/brainstorm", cards["Brainstorm"].url)
	assert.Equal(t, 1602, cards["Lightning Bolt"].elo)
	assert.Equal(t, 1399, cards["Counterspell"].elo)
	_, blankPresent := cards[""]
	assert.False(t, blankPresent)
}

func TestFetchCubeCobraCards_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	_, err := fetchCubeCobraCards(srv.URL, "missing")
	assert.Error(t, err)
}
