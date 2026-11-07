// Package searchapi serves the search language to the browser: whether a
// search parses, and the keywords the search bar's autocomplete and help show.
package searchapi

import (
	"encoding/json"
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/search"
)

// CheckResponse says whether a search parses. Error is empty when it does,
// and otherwise says what's wrong in words the person typing can act on.
type CheckResponse struct {
	Error string `json:"error"`
}

// CheckHandler serves GET /api/search/check?q=...&target=..., where target is
// rules, cards or decks.
func CheckHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		target, err := search.ParseTarget(r.URL.Query().Get("target"))
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadRequest)
			return
		}
		resp := CheckResponse{}
		if _, err := search.Compile(r.URL.Query().Get("q"), target); err != nil {
			resp.Error = err.Error()
		}
		writeJSON(rw, resp)
	})
}

// KeywordsHandler serves GET /api/search/keywords?target=..., the keywords a
// target accepts with their operators, examples and help text.
func KeywordsHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		target, err := search.ParseTarget(r.URL.Query().Get("target"))
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(rw, search.Keywords(target))
	})
}

// writeJSON writes v as the JSON response.
func writeJSON(rw http.ResponseWriter, v any) {
	rw.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(rw).Encode(v); err != nil {
		logrus.WithError(err).Error("could not write search response")
	}
}
