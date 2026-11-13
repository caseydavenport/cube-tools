package server

import (
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

const (
	// cardSearchLimit is the most names one card search returns.
	cardSearchLimit = 20

	// cardSearchMinLength is the shortest query a card search answers; a
	// single letter would match most of Magic.
	cardSearchMinLength = 2
)

// CardSearchResponse lists card names matching a search.
type CardSearchResponse struct {
	Names []string `json:"names"`
}

// CardSearchHandler serves names of any Magic card matching the "q" query
// parameter, for opening the card page of a card outside the cube.
func CardSearchHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		resp := CardSearchResponse{Names: []string{}}
		if len(q) >= cardSearchMinLength {
			resp.Names = types.SearchOracleNames(q, cardSearchLimit)
		}
		writeJSON(rw, http.StatusOK, resp)
	})
}
