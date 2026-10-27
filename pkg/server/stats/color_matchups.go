package stats

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/caseydavenport/cube-tools/pkg/utils"
	"github.com/sirupsen/logrus"
)

type ColorMatchupResponse struct {
	Matchups map[string]map[string]*MatchupRecord `json:"matchups"`
}

type MatchupRecord struct {
	Wins           int     `json:"wins"`
	Losses         int     `json:"losses"`
	Draws          int     `json:"draws"`
	WinPct         float64 `json:"win_pct"`
	BayesianWinPct float64 `json:"bayesian_win_pct"`
}

func ColorMatchupHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &colorMatchupHandler{q: newQuery(store, src)}
}

type colorMatchupHandler struct {
	q *deckquery.Query
}

func (h *colorMatchupHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)

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
	logrus.WithField("params", dr).Info("/api/stats/color-matchups")

	allDecks, err := h.q.Decks(server.CubeFromRequest(r), dr)
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

	for _, opponents := range matchups {
		for _, record := range opponents {
			record.WinPct = winPctOf(record.Wins, record.Losses, record.Draws)
			record.BayesianWinPct = utils.BayesianAverage(record.Wins, record.Losses, record.Draws, bayesPriorGames(colorMode))
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
