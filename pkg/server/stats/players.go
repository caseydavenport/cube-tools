package stats

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

type PlayerStatsResponse struct {
	Players map[string]*PlayerStats `json:"players"`
}

type PlayerStats struct {
	Record

	// ID is the player's ID in the player list, or zero for a source without
	// player IDs.
	ID                 int                      `json:"id,omitempty"`
	Name               string                   `json:"name"`
	NumDecks           int                      `json:"num_decks"`
	Games              int                      `json:"games"`
	LossPercent        float64                  `json:"loss_percent"`
	Trophies           int                      `json:"trophies"`
	LastPlace          int                      `json:"last_place"`
	OpponentWinPercent float64                  `json:"opponent_win_percentage"`
	WhitePercent       float64                  `json:"white_percent"`
	BluePercent        float64                  `json:"blue_percent"`
	BlackPercent       float64                  `json:"black_percent"`
	RedPercent         float64                  `json:"red_percent"`
	GreenPercent       float64                  `json:"green_percent"`
	Uniqueness         float64                  `json:"uniqueness"`
	TotalPicks         int                      `json:"total_picks"`
	UniqueCards        map[string]int           `json:"unique_cards"`
	ColorPicks         map[string]int           `json:"color_picks"`
	ArchetypeStats     map[string]*winLossStats `json:"archetype_stats"`
	ColorStats         map[string]*winLossStats `json:"color_stats"`
}

type winLossStats struct {
	Record
	Count int `json:"count"`
}

// opponentWinAccum tracks the weighted sum for computing opponent win percentage.
type opponentWinAccum struct {
	weightedSum  float64
	totalMatches int
}

func PlayerStatsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &playerStatsHandler{q: newQuery(store, src)}
}

type playerStatsHandler struct {
	q *deckquery.Query
}

func (s *playerStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/stats/players")

	cubeID := server.CubeFromRequest(r)
	allDecks, err := s.q.Decks(cubeID, dr)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	resp := PlayerStatsResponse{
		Players: make(map[string]*PlayerStats),
	}

	// Track weighted opponent win percentage accumulation per player.
	owpAccum := make(map[string]*opponentWinAccum)

	for _, deck := range allDecks {
		// Seat labels repeat in every draft, so anonymous decks belong to no
		// player. Names are unique, so keying by name keeps people apart.
		if deck.IsAnonymous() {
			continue
		}
		if _, ok := resp.Players[deck.Player]; !ok {
			resp.Players[deck.Player] = &PlayerStats{
				ID:             deck.PlayerID,
				Name:           deck.Player,
				UniqueCards:    make(map[string]int),
				ColorPicks:     make(map[string]int),
				ArchetypeStats: make(map[string]*winLossStats),
				ColorStats:     make(map[string]*winLossStats),
			}
		}
		ps := resp.Players[deck.Player]
		ps.NumDecks++
		ps.Add(deck)
		ps.Trophies += deck.Trophies()
		ps.LastPlace += deck.LastPlace()
		if _, ok := owpAccum[deck.Player]; !ok {
			owpAccum[deck.Player] = &opponentWinAccum{}
		}
		matches := len(deck.Matches)
		if matches > 0 {
			owpAccum[deck.Player].weightedSum += deck.OpponentWinPercentage * float64(matches)
			owpAccum[deck.Player].totalMatches += matches
		}

		// Track archetype win/loss for the player. Include both the macro
		// archetype and any secondary labels.
		archLabels := deck.Labels
		if deck.MacroArchetype != "" {
			archLabels = append(archLabels, deck.MacroArchetype)
		}
		for _, label := range archLabels {
			l := strings.ToLower(label)
			if _, ok := ps.ArchetypeStats[l]; !ok {
				ps.ArchetypeStats[l] = &winLossStats{}
			}
			as := ps.ArchetypeStats[l]
			as.Add(deck)
			as.Count++
		}

		// Track color identity win/loss for the player.
		colors := deck.GetColors()
		for color := range colors {
			if _, ok := ps.ColorStats[color]; !ok {
				ps.ColorStats[color] = &winLossStats{}
			}
			cs := ps.ColorStats[color]
			cs.Add(deck)
			cs.Count++
		}

		for _, card := range deck.Mainboard {
			if card.IsBasicLand() {
				continue
			}
			ps.TotalPicks++
			ps.UniqueCards[card.Name]++
			for _, color := range card.Colors {
				ps.ColorPicks[color]++
			}
		}
	}

	for _, ps := range resp.Players {
		ps.Games = ps.Wins + ps.Losses + ps.Draws
		ps.Finalize()
		ps.LossPercent = pct(float64(ps.Losses), float64(ps.Games))
		for _, as := range ps.ArchetypeStats {
			as.Finalize()
		}
		for _, cs := range ps.ColorStats {
			cs.Finalize()
		}
		if accum, ok := owpAccum[ps.Name]; ok && accum.totalMatches > 0 {
			// accum.weightedSum is already a percentage; just round to 2 decimals.
			ps.OpponentWinPercent = math.Round(100*accum.weightedSum/float64(accum.totalMatches)) / 100
		}
		ps.WhitePercent = pct(float64(ps.ColorPicks["W"]), float64(ps.TotalPicks))
		ps.BluePercent = pct(float64(ps.ColorPicks["U"]), float64(ps.TotalPicks))
		ps.BlackPercent = pct(float64(ps.ColorPicks["B"]), float64(ps.TotalPicks))
		ps.RedPercent = pct(float64(ps.ColorPicks["R"]), float64(ps.TotalPicks))
		ps.GreenPercent = pct(float64(ps.ColorPicks["G"]), float64(ps.TotalPicks))
		ps.Uniqueness = pct(float64(len(ps.UniqueCards)), float64(ps.TotalPicks))
	}

	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	rw.Write(b)
}
