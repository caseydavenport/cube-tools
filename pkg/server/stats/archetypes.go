package stats

import (
	"encoding/json"
	"math"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
)

type ArchetypeStatsResponse struct {
	TotalGames int                        `json:"total_games"`
	Archetypes map[string]*ArchetypeStats `json:"archetypes"`
}

type ArchetypeStats struct {
	Type          string         `json:"type"`
	Count         int            `json:"count"`
	Wins          int            `json:"wins"`
	Losses        int            `json:"losses"`
	Trophies      int            `json:"trophies"`
	LastPlace     int            `json:"last_place"`
	Winning       int            `json:"winning"`
	Losing        int            `json:"losing"`
	AvgCMC        float64        `json:"avg_cmc"`
	BuildPercent  float64        `json:"build_percent"`
	WinPercent    float64        `json:"win_percent"`
	PercentOfWins float64        `json:"percent_of_wins"`
	SharedWith    map[string]int `json:"shared_with"`
	Players       map[string]int `json:"players"`
	AvgShared     float64        `json:"avg_shared"`
}

func ArchetypeStatsHandler() http.Handler {
	return &archetypeStatsHandler{
		store: storage.NewFileDeckStoreWithCache(),
	}
}

type archetypeStatsHandler struct {
	store storage.DeckStorage
}

func (s *archetypeStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/stats/archetypes")

	allDecks, err := s.store.List(dr)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	resp := ArchetypeStatsResponse{
		Archetypes: make(map[string]*ArchetypeStats),
	}

	// Initialize macro archetypes.
	macros := []string{"aggro", "midrange", "control", "tempo"}
	for _, m := range macros {
		resp.Archetypes[m] = &ArchetypeStats{Type: m, SharedWith: make(map[string]int), Players: make(map[string]int)}
	}

	totalWins := 0
	for _, deck := range allDecks {
		totalWins += deck.GameWins()

		for _, label := range deck.Labels {
			if _, ok := resp.Archetypes[label]; !ok {
				resp.Archetypes[label] = &ArchetypeStats{Type: label, SharedWith: make(map[string]int), Players: make(map[string]int)}
			}
			as := resp.Archetypes[label]
			as.Count++
			as.Wins += deck.GameWins()
			as.Losses += deck.GameLosses()
			as.Trophies += deck.Trophies()
			as.LastPlace += deck.LastPlace()
			as.Winning += deck.TopHalf()
			as.Losing += deck.BottomHalf()

			// Add to CMC sum (will divide later).
			// Note: We need to access types.Deck.AvgCMC but it might not be in storage.Deck if not calculated.
			// Re-calculating avg CMC here is safer if it's missing.
			deckCMC := 0.0
			count := 0
			for _, card := range deck.Mainboard {
				if !card.IsLand() {
					deckCMC += float64(card.CMC)
					count++
				}
			}
			if count > 0 {
				as.AvgCMC += deckCMC / float64(count)
			}

			as.Players[deck.Player]++

			// Track shared labels.
			for _, other := range deck.Labels {
				if other == label || other == "aggro" || other == "midrange" || other == "control" {
					continue
				}
				as.SharedWith[other]++
			}
		}
	}

	resp.TotalGames = totalWins
	numDecks := len(allDecks)

	for _, as := range resp.Archetypes {
		if numDecks > 0 {
			as.BuildPercent = math.Round(float64(as.Count) / float64(numDecks) * 100)
		}
		if as.Wins+as.Losses > 0 {
			as.WinPercent = math.Round(float64(as.Wins) / float64(as.Wins+as.Losses) * 100)
		}
		if totalWins > 0 {
			as.PercentOfWins = math.Round(float64(as.Wins) / float64(totalWins) * 100)
		}
		if as.Count > 0 {
			as.AvgCMC = math.Round(as.AvgCMC/float64(as.Count)*100) / 100
			totalShared := 0
			for _, count := range as.SharedWith {
				totalShared += count
			}
			as.AvgShared = math.Round(float64(totalShared)/float64(as.Count)*100) / 100
		}
	}

	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	rw.Write(b)
}
