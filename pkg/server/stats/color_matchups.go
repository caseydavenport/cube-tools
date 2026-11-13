package stats

import (
	"encoding/json"
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/caseydavenport/cube-tools/pkg/utils"
)

// ColorMatchupResponse is the color matchup payload: win records keyed by the player's color group, then by the opponent's.
type ColorMatchupResponse struct {
	Matchups map[string]map[string]*MatchupRecord `json:"matchups"`
}

// MatchupRecord is one color group's games against another. WinPctLow and
// WinPctHigh bound WinPct at the request's confidence, and Significant reports
// whether that interval leaves out 50%, so the heatmap can shade only those.
type MatchupRecord struct {
	Wins           int     `json:"wins"`
	Losses         int     `json:"losses"`
	Draws          int     `json:"draws"`
	WinPct         float64 `json:"win_pct"`
	BayesianWinPct float64 `json:"bayesian_win_pct"`
	WinPctLow      float64 `json:"win_pct_low"`
	WinPctHigh     float64 `json:"win_pct_high"`
	Significant    bool    `json:"significant"`
}

// finish fills in the record's rates from its counts. prior is the Bayes
// prior in games and z the interval's critical value.
func (m *MatchupRecord) finish(prior, z float64) {
	m.WinPct = winPctOf(m.Wins, m.Losses, m.Draws)
	m.BayesianWinPct = utils.BayesianAverage(m.Wins, m.Losses, m.Draws, prior)
	m.WinPctLow, m.WinPctHigh = wilsonInterval(m.Wins, m.Losses, m.Draws, z)
	if m.Wins+m.Losses+m.Draws > 0 {
		m.Significant = m.WinPctLow > 50 || m.WinPctHigh < 50
	}
}

// ColorMatchupHandler serves the color-versus-color matchup records for the requested cube and decks.
func ColorMatchupHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &colorMatchupHandler{q: deckquery.New(store, src)}
}

type colorMatchupHandler struct {
	q *deckquery.Query
}

// ServeHTTP builds the color matchup records for the request and writes them as JSON.
func (h *colorMatchupHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	decksReq := decks.ParseDecksRequest(r)

	// Determine color mode and type from query parameters.
	colorMode := colorMode(r.URL.Query().Get("color_mode"))
	if colorMode == "" {
		colorMode = ColorModeExact
	}
	groupMode := r.URL.Query().Get("color_type")
	if groupMode == "" {
		groupMode = "None"
	}

	groupSize := 0
	switch groupMode {
	case "Mono":
		groupSize = 1
	case "Dual":
		groupSize = 2
	case "Trio":
		groupSize = 3
	}
	logrus.WithField("params", decksReq).Info("/api/stats/color-matchups")

	allDecks, err := h.q.Decks(server.CubeFromRequest(r), decksReq)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	idx := storage.NewOpponentIndex(allDecks)

	// Aggregate matchup data. matchups[myColors][oppColors] = {wins, losses}
	matchups := make(map[string]map[string]*MatchupRecord)

	switch colorMode {
	case ColorModeExact, ColorModePrimary, ColorModeInclusive:
		// valid modes
	default:
		http.Error(rw, "invalid color_mode parameter", http.StatusBadRequest)
		return
	}

	for _, deck := range allDecks {
		if deck.Metadata.DraftID == 0 {
			continue
		}

		myGroups := colorGroups(deck, colorMode, groupSize)
		if len(myGroups) == 0 {
			continue
		}

		for _, game := range deck.Games {
			oppDeck, ok := idx.OpponentDeck(deck, game.Opponent)
			if !ok {
				continue
			}

			oppGroups := colorGroups(oppDeck, colorMode, groupSize)
			if len(oppGroups) == 0 {
				continue
			}

			for _, myColors := range myGroups {
				for _, oppColors := range oppGroups {
					if _, ok := matchups[myColors]; !ok {
						matchups[myColors] = make(map[string]*MatchupRecord)
					}
					if _, ok := matchups[myColors][oppColors]; !ok {
						matchups[myColors][oppColors] = &MatchupRecord{}
					}

					switch {
					case game.Tie || game.Winner == "":
						matchups[myColors][oppColors].Draws++
					case game.Winner == deck.Player:
						matchups[myColors][oppColors].Wins++
					default:
						matchups[myColors][oppColors].Losses++
					}
				}
			}
		}
	}

	z := zForConfidence(query.GetFloat(r, "confidence"))
	for _, opponents := range matchups {
		for _, record := range opponents {
			record.finish(bayesPriorGames(colorMode), z)
		}
	}

	resp := ColorMatchupResponse{Matchups: matchups}
	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write color matchup response")
	}
}

// colorGroups returns canonical color group strings of the given size for a deck.
// groupSize: 1 for mono-color, 2 for dual-color, 3 for trio-color.
// mode controls how decks with more colors than groupSize are handled:
//
//	 "inclusive": all subsets of the given size are returned.
//	 "exact": only decks with exactly groupSize colors return a group.
//	 "primary": same as exact, plus for dual (groupSize=2) 3+ color decks
//		           with a clear primary pair (splash detection) are included.
func colorGroups(d *storage.Deck, mode colorMode, groupSize int) []string {
	colors := d.GetColors()

	// No colors means no decklist and no recorded colors: unknown, not colorless.
	if len(colors) == 0 {
		return nil
	}

	// If the deck has fewer colors than the requested group size, filter it out
	// by returning nil.
	if groupSize >= 0 && len(colors) < groupSize {
		return nil
	}

	switch mode {
	case ColorModeExact:
		// Only return the group if the deck has exactly groupSize colors. If "Any"
		// is requested (groupSize=0), return all decks.
		if groupSize == 0 || len(colors) == groupSize {
			return []string{colors.String()}
		}
		return nil
	case ColorModePrimary:
		// Primary only produces pairs, so if the requested group size is not 2, return nil.
		if groupSize != 0 && groupSize != 2 {
			return nil
		}

		// "primary": returns nothing for mono-color decks, the exact color pair for dual-color decks,
		// and the primary color pair for 3+ color decks.
		pair := d.PrimaryColorPair()
		if pair == nil {
			return nil
		}
		return []string{pair.String()}
	case ColorModeInclusive:
		// "inclusive": return all subsets of the given size. If "Any" is requested (groupSize=0), return all decks.
		subsets := colors.SubsetsOfSize(groupSize)
		if groupSize == 0 {
			subsets = colors.Subsets()
		}
		asStrings := make([]string, len(subsets))
		for i, subset := range subsets {
			asStrings[i] = subset.String()
		}
		return asStrings
	}

	// If we reach here, the mode was unrecognized. Return nil to indicate no groups.
	// This shouldn't happen in practice - we validate the mode up front.
	return nil
}
