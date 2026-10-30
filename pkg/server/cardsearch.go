package server

import (
	"encoding/json"
	"net/http"

	"github.com/sirupsen/logrus"

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

		b, err := json.Marshal(resp)
		if err != nil {
			http.Error(rw, "could not marshal response", http.StatusInternalServerError)
			return
		}
		rw.Header().Set("Content-Type", "application/json")
		if _, err := rw.Write(b); err != nil {
			logrus.WithError(err).Error("could not write card search response")
		}
	})
}
