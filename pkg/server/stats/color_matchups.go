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
	colorMode := r.URL.Query().Get("color_mode")
	if colorMode == "" {
		colorMode = "inclusive"
	}
	colorType := r.URL.Query().Get("color_type")
	if colorType == "" {
		colorType = "Dual"
	}
	groupSize := 2
	switch colorType {
	case "Mono":
		groupSize = 1
	case "Trio":
		groupSize = 3
	}
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

		myGroups := colorGroups(deck, colorMode, groupSize)
		if len(myGroups) == 0 {
			continue
		}

		for _, game := range deck.Games {
			// Look up opponent's deck.
			oppDeck, ok := deckLookup[deckKey{player: game.Opponent, draftID: deck.Metadata.DraftID}]
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

					if game.Winner == deck.Player {
						matchups[myColors][oppColors].Wins++
					} else if game.Winner != "" && !game.Tie {
						matchups[myColors][oppColors].Losses++
					}
				}
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

// colorGroups returns canonical color group strings of the given size for a deck.
// groupSize: 1 for mono-color, 2 for dual-color, 3 for trio-color.
// mode controls how decks with more colors than groupSize are handled:
//
//	"inclusive": all subsets of the given size are returned.
//	"exact": only decks with exactly groupSize colors return a group.
//	"primary": same as exact, plus for dual (groupSize=2) 3+ color decks
//	           with a clear primary pair (splash detection) are included.
func colorGroups(d *storage.Deck, mode string, groupSize int) []string {
	colors := d.GetColors()
	if len(colors) < groupSize {
		return nil
	}
	// Sort colors by WUBRG order.
	sort.Slice(colors, func(i, j int) bool {
		return strings.Index("WUBRG", colors[i]) < strings.Index("WUBRG", colors[j])
	})
	if mode == "exact" || mode == "primary" {
		if len(colors) == groupSize {
			return []string{strings.Join(colors, "")}
		}
		if mode == "primary" && groupSize == 2 && len(colors) > 2 {
			pair := d.PrimaryColorPair()
			if pair == nil {
				return nil
			}
			return []string{pair[0] + pair[1]}
		}
		return nil
	}
	// "inclusive": return all subsets of the given size.
	return combinations(colors, groupSize)
}

// combinations returns all size-k subsets of items, joined as strings.
func combinations(items []string, k int) []string {
	if k <= 0 || k > len(items) {
		return nil
	}
	var result []string
	indices := make([]int, k)
	for i := range indices {
		indices[i] = i
	}
	for {
		combo := make([]string, k)
		for i, idx := range indices {
			combo[i] = items[idx]
		}
		result = append(result, strings.Join(combo, ""))

		// Advance to next combination.
		i := k - 1
		for i >= 0 && indices[i] == len(items)-k+i {
			i--
		}
		if i < 0 {
			break
		}
		indices[i]++
		for j := i + 1; j < k; j++ {
			indices[j] = indices[j-1] + 1
		}
	}
	return result
}
