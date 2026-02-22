package stats

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
)

type ColorMatchupResponse struct {
	Matchups map[string]map[string]*MatchupRecord `json:"matchups"`
}

type MatchupRecord struct {
	Wins   int     `json:"wins"`
	Losses int     `json:"losses"`
	WinPct float64 `json:"win_pct"`
}

func ColorMatchupHandler() http.Handler {
	return &colorMatchupHandler{
		store: storage.NewFileDeckStoreWithCache(),
	}
}

type colorMatchupHandler struct {
	store storage.DeckStorage
}

func (h *colorMatchupHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/stats/color-matchups")

	allDecks, err := h.store.List(dr)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Build a (player, draftID) -> deck lookup map for O(1) opponent resolution.
	type deckKey struct {
		player  string
		draftID string
	}
	deckLookup := make(map[deckKey]*storage.Deck)
	for _, d := range allDecks {
		k := deckKey{player: d.Player, draftID: d.Metadata.DraftID}
		deckLookup[k] = d
	}

	// Aggregate matchup data. matchups[myColors][oppColors] = {wins, losses}
	matchups := make(map[string]map[string]*MatchupRecord)

	for _, deck := range allDecks {
		if deck.Metadata.DraftID == "" {
			continue
		}

		myColors := colorPairString(deck)
		if myColors == "" {
			continue // Not a dual-color deck.
		}

		for _, game := range deck.Games {
			// Look up opponent's deck.
			oppDeck, ok := deckLookup[deckKey{player: game.Opponent, draftID: deck.Metadata.DraftID}]
			if !ok {
				continue
			}

			oppColors := colorPairString(oppDeck)
			if oppColors == "" {
				continue // Opponent isn't a dual-color deck.
			}

			if _, ok := matchups[myColors]; !ok {
				matchups[myColors] = make(map[string]*MatchupRecord)
			}
			if _, ok := matchups[myColors][oppColors]; !ok {
				matchups[myColors][oppColors] = &MatchupRecord{}
			}

			if game.Winner == deck.Player {
				matchups[myColors][oppColors].Wins++
			} else if game.Winner != "" && !game.Tie {
				matchups[myColors][oppColors].Losses++
			}
		}
	}

	// Calculate win percentages.
	for _, opponents := range matchups {
		for _, record := range opponents {
			total := record.Wins + record.Losses
			if total > 0 {
				record.WinPct = 100 * float64(record.Wins) / float64(total)
			}
		}
	}

	resp := ColorMatchupResponse{Matchups: matchups}
	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	rw.Write(b)
}

// colorPairString returns the canonical dual-color string for a deck,
// or "" if the deck doesn't have exactly 2 colors.
func colorPairString(d *storage.Deck) string {
	colors := d.GetColors()
	if len(colors) != 2 {
		return ""
	}
	// Sort by WUBRG order.
	sort.Slice(colors, func(i, j int) bool {
		return strings.Index("WUBRG", colors[i]) < strings.Index("WUBRG", colors[j])
	})
	return strings.Join(colors, "")
}
