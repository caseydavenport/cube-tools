package decks

import (
	"encoding/json"
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// colorOrder is the order deck colors are listed in.
const colorOrder = "WUBRG"

// SummaryResponse is the body of GET /api/{cube}/decks/summary.
type SummaryResponse struct {
	Decks []DeckSummary `json:"decks"`
}

// DeckSummary is the slim view of a deck that the cube home page needs: who
// played it, in which draft, its colors, and its match record. Field names
// match the full deck's JSON, so the UI's deck helpers work on either.
type DeckSummary struct {
	ID       int             `json:"id"`
	Metadata SummaryMetadata `json:"metadata"`
	Player   string          `json:"player"`
	PlayerID int             `json:"player_id,omitempty"`
	Seat     int             `json:"seat,omitempty"`
	Colors   []string        `json:"colors"`
	Stats    SummaryStats    `json:"stats"`
}

// SummaryMetadata names the draft a summarized deck was played in.
type SummaryMetadata struct {
	DraftID int `json:"draft_id"`
}

// SummaryStats is the part of a deck's record the cube home shows.
type SummaryStats struct {
	MatchWins   int `json:"match_wins"`
	MatchLosses int `json:"match_losses"`
	MatchDraws  int `json:"match_draws"`
	Trophies    int `json:"trophies"`
}

// SummaryHandler serves GET /api/{cube}/decks/summary: every deck in the cube,
// reduced to the few fields the cube home reads. It replaces the full deck
// list there, which carries every card and runs to megabytes.
func SummaryHandler(store storage.DeckStorage) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := r.PathValue("cube")
		decks, err := store.List(cube, &storage.DecksRequest{})
		if err != nil {
			logrus.WithError(err).WithField("cube", cube).Error("could not load decks for summary")
			http.Error(rw, "could not load decks", http.StatusInternalServerError)
			return
		}

		resp := SummaryResponse{Decks: make([]DeckSummary, 0, len(decks))}
		for _, d := range decks {
			resp.Decks = append(resp.Decks, summarize(d))
		}

		rw.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(rw).Encode(resp); err != nil {
			logrus.WithError(err).WithField("cube", cube).Warn("Failed to write deck summary response")
		}
	})
}

// summarize reduces one deck to its summary. Colors use the server's rule
// (types.Deck.GetColors): explicit colors if set, otherwise the mainboard's colors
// without hybrids, listed in WUBRG order.
func summarize(d *storage.Deck) DeckSummary {
	present := d.Deck.GetColors()
	colors := []string{}
	for _, c := range colorOrder {
		if present[string(c)] {
			colors = append(colors, string(c))
		}
	}

	return DeckSummary{
		ID:       d.ID,
		Metadata: SummaryMetadata{DraftID: d.Metadata.DraftID},
		Player:   d.Player,
		PlayerID: d.PlayerID,
		Seat:     d.Seat,
		Colors:   colors,
		Stats: SummaryStats{
			MatchWins:   d.Stats.MatchWins,
			MatchLosses: d.Stats.MatchLosses,
			MatchDraws:  d.Stats.MatchDraws,
			Trophies:    d.Stats.Trophies,
		},
	}
}
