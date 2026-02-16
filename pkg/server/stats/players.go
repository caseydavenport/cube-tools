package stats

import (
	"encoding/json"
	"math"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
)

type PlayerStatsResponse struct {
	Players map[string]*PlayerStats `json:"players"`
}

type PlayerStats struct {
	Name                 string         `json:"name"`
	NumDecks             int            `json:"num_decks"`
	Wins                 int            `json:"wins"`
	Losses               int            `json:"losses"`
	Games                int            `json:"games"`
	WinPercent           float64        `json:"win_percent"`
	LossPercent          float64        `json:"loss_percent"`
	Trophies             int            `json:"trophies"`
	LastPlace            int            `json:"last_place"`
	OpponentWinPercent   float64        `json:"opponent_win_percentage"`
	WhitePercent         float64        `json:"white_percent"`
	BluePercent          float64        `json:"blue_percent"`
	BlackPercent         float64        `json:"black_percent"`
	RedPercent           float64        `json:"red_percent"`
	GreenPercent         float64        `json:"green_percent"`
	Uniqueness           float64        `json:"uniqueness"`
	TotalPicks           int            `json:"total_picks"`
	UniqueCards          map[string]int `json:"unique_cards"`
	ColorPicks           map[string]int `json:"color_picks"`
}

func PlayerStatsHandler() http.Handler {
	return &playerStatsHandler{
		store: storage.NewFileDeckStoreWithCache(),
	}
}

type playerStatsHandler struct {
	store storage.DeckStorage
}

func (s *playerStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/stats/players")

	allDecks, err := s.store.List(dr)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	resp := PlayerStatsResponse{
		Players: make(map[string]*PlayerStats),
	}

	for _, deck := range allDecks {
		if _, ok := resp.Players[deck.Player]; !ok {
			resp.Players[deck.Player] = &PlayerStats{
				Name:        deck.Player,
				UniqueCards: make(map[string]int),
				ColorPicks:  make(map[string]int),
			}
		}
		ps := resp.Players[deck.Player]
		ps.NumDecks++
		ps.Wins += deck.GameWins()
		ps.Losses += deck.GameLosses()
		ps.Trophies += deck.Trophies()
		ps.LastPlace += deck.LastPlace()
		ps.OpponentWinPercent += deck.OpponentWinPercentage

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
		ps.Games = ps.Wins + ps.Losses
		if ps.Games > 0 {
			ps.WinPercent = math.Round(float64(ps.Wins) / float64(ps.Games) * 100)
			ps.LossPercent = math.Round(float64(ps.Losses) / float64(ps.Games) * 100)
		}
		if ps.NumDecks > 0 {
			ps.OpponentWinPercent = math.Round(ps.OpponentWinPercent / float64(ps.NumDecks))
		}
		if ps.TotalPicks > 0 {
			ps.WhitePercent = math.Round(float64(ps.ColorPicks["W"]) / float64(ps.TotalPicks) * 100)
			ps.BluePercent = math.Round(float64(ps.ColorPicks["U"]) / float64(ps.TotalPicks) * 100)
			ps.BlackPercent = math.Round(float64(ps.ColorPicks["B"]) / float64(ps.TotalPicks) * 100)
			ps.RedPercent = math.Round(float64(ps.ColorPicks["R"]) / float64(ps.TotalPicks) * 100)
			ps.GreenPercent = math.Round(float64(ps.ColorPicks["G"]) / float64(ps.TotalPicks) * 100)
			ps.Uniqueness = math.Round(float64(len(ps.UniqueCards)) / float64(ps.TotalPicks) * 100)
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
