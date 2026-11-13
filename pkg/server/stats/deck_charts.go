package stats

import (
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// DeckChartsResponse holds every chart the Deck Stats page draws from the
// server, so the page needs one request.
type DeckChartsResponse struct {
	// HeadToHead holds the gap buckets for each headToHeadFeatures key.
	HeadToHead   map[string][]*GapBucket `json:"head_to_head"`
	CloseMatches []*CloseMatchRow        `json:"close_matches"`
	Forest       []*ForestRow            `json:"forest"`
	ManaCurve    []*CurveRow             `json:"mana_curve"`
	TypeMix      []*TypeMixRow           `json:"type_mix"`
	Splash       []*SplashBucket         `json:"splash"`
}

// DeckChartsHandler serves the Deck Stats charts for the decks matching the
// request's filters, at the request's confidence level.
func DeckChartsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &deckChartsHandler{q: deckquery.New(store, src)}
}

type deckChartsHandler struct {
	q *deckquery.Query
}

// ServeHTTP answers with every Deck Stats chart as one JSON object.
func (h *deckChartsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/stats/deck-charts")

	cubeID := server.CubeFromRequest(r)
	filtered, err := h.q.Decks(cubeID, dr)
	if err != nil {
		logrus.WithError(err).Error("could not load decks for deck charts")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Opponents come from every deck, so a filter keeps games against anyone.
	all, err := h.q.Decks(cubeID, nil)
	if err != nil {
		logrus.WithError(err).Error("could not load every deck for deck charts")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	z := zForConfidence(query.GetFloat(r, "confidence"))
	writeJSON(rw, deckCharts(filtered, all, z), "deck charts")
}

// deckCharts computes every Deck Stats chart for decks, finding opponents
// among allDecks. z is the critical value for the intervals.
func deckCharts(decks, allDecks []*storage.Deck, z float64) *DeckChartsResponse {
	resp := &DeckChartsResponse{
		HeadToHead:   make(map[string][]*GapBucket, len(headToHeadFeatures)),
		CloseMatches: closeMatches(decks, z),
		Forest:       forestRows(decks, z),
		ManaCurve:    manaCurve(decks),
		TypeMix:      typeMix(decks),
		Splash:       splashSize(decks, z),
	}
	for _, f := range headToHeadFeatures {
		resp.HeadToHead[f.Key] = headToHead(decks, allDecks, f, z)
	}
	return resp
}
