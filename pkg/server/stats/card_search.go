package stats

import (
	"net/http"
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CardSearchResponse is the Cards page search's answer: the names of the
// cards matching it, sorted, or why the search doesn't parse.
type CardSearchResponse struct {
	Names []string `json:"names"`
	Error string   `json:"error,omitempty"`
}

// CardSearchHandler serves GET /api/{cube}/stats/cards/search. "q" is a
// search in the card search syntax, play-stat keywords included, judged
// against the same decks the card stats endpoint reads for the request.
func CardSearchHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &cardSearchHandler{stats: &cardStatsHandler{q: newQuery(store, src)}}
}

type cardSearchHandler struct {
	stats *cardStatsHandler
}

// ServeHTTP answers a search with the matching card names. A search that
// doesn't parse is answered with its error rather than an error status, so
// the page can show it under the search bar.
func (h *cardSearchHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	resp := CardSearchResponse{Names: []string{}}
	compiled, err := search.Compile(r.URL.Query().Get("q"), search.TargetCards)
	if err != nil {
		resp.Error = err.Error()
		writeJSON(rw, resp, "card search")
		return
	}

	sr := parseCardsRequest(r)
	cubeID := server.CubeFromRequest(r)
	cube, cubeCards, err := h.stats.cubeCards(cubeID)
	if err != nil {
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}
	allDecks, err := h.stats.q.Decks(cubeID, sr.DecksRequest)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}
	all := h.stats.statsForDecks(allDecks, cubeCards, sr)
	addPopularity(all, cube, draftRates(allDecks))

	for name, row := range all.Data {
		if compiled.MatchCardStats(searchCard(row)) {
			resp.Names = append(resp.Names, name)
		}
	}
	slices.Sort(resp.Names)
	writeJSON(rw, resp, "card search")
}

// searchCard is a card stats row as the search engine reads it.
func searchCard(row *cardStats) search.Card {
	return search.Card{
		Card: row.Card,
		Stats: &search.CardStats{
			Games:      row.TotalGames,
			Mainboard:  row.Mainboard,
			Sideboard:  row.Sideboard,
			Players:    len(row.Players),
			Drafts:     row.Drafts,
			WinPct:     row.WinPercent,
			Popularity: row.Popularity,
		},
	}
}

// cubeCards loads the cube's current list, and its cards by name.
func (d *cardStatsHandler) cubeCards(cubeID string) (*types.Cube, map[string]types.Card, error) {
	cube, err := d.q.Cube(cubeID)
	if err != nil {
		return nil, nil, err
	}
	byName := make(map[string]types.Card, len(cube.Cards))
	for _, c := range cube.Cards {
		byName[c.Name] = c
	}
	return cube, byName, nil
}
