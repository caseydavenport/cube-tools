package stats

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// playerBayesPriorGames is the coin-flip games mixed into a player's Bayes
// rate. On polyverse (2026-10-29) players with 10+ games differ by about 9
// points beyond chance, which fits about 31.
const playerBayesPriorGames = 30

type PlayerStatsResponse struct {
	Players map[string]*PlayerStats `json:"players"`

	// Buckets holds one set of player rows per time bucket when the request
	// sets bucket_size. Players is empty then.
	Buckets []*PlayerBucket `json:"buckets,omitempty"`
}

// PlayerBucket is the player rows for one time bucket of drafts.
type PlayerBucket struct {
	// Name labels the bucket by the dates it spans.
	Name string `json:"name"`

	// Start is the bucket's first draft date, used as the x-axis label.
	Start string `json:"start"`

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
	TotalPicks         int                      `json:"total_picks"`
	UniqueCards        map[string]int           `json:"unique_cards"`
	ColorPicks         map[string]int           `json:"color_picks"`
	ArchetypeStats     map[string]*winLossStats `json:"archetype_stats"`
	ColorStats         map[string]*winLossStats `json:"color_stats"`

	// Opponents is the player's game record against each named opponent.
	// Anonymous seats and unnamed opponents are left out.
	Opponents map[string]*Record `json:"opponents"`
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

	z := zForConfidence(query.GetFloat(r, "confidence"))
	resp := PlayerStatsResponse{}
	bucketSize := query.GetInt(r, "bucket_size")
	if bucketSize > 0 {
		for _, b := range decks.DeckBuckets(allDecks, bucketSize, !query.GetBool(r, "sliding")) {
			resp.Buckets = append(resp.Buckets, &PlayerBucket{
				Name:    b.Name(),
				Start:   b.Start(),
				Players: playerRows(b.AllDecks(), z),
			})
		}
	} else {
		resp.Players = playerRows(allDecks, z)
	}

	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write player stats response")
	}
}

// playerRows aggregates decks into one row per named player, with per-archetype,
// per-color and per-opponent records. Every record gets its Bayes rate and an
// interval at critical value z. Anonymous seats belong to no player.
func playerRows(allDecks []*storage.Deck, z float64) map[string]*PlayerStats {
	rows := make(map[string]*PlayerStats)

	// Track weighted opponent win percentage accumulation per player.
	owpAccum := make(map[string]*opponentWinAccum)

	for _, deck := range allDecks {
		// Seat labels repeat in every draft, so anonymous decks belong to no
		// player. Names are unique, so keying by name keeps people apart.
		if deck.IsAnonymous() {
			continue
		}
		if _, ok := rows[deck.Player]; !ok {
			rows[deck.Player] = &PlayerStats{
				ID:             deck.PlayerID,
				Name:           deck.Player,
				UniqueCards:    make(map[string]int),
				ColorPicks:     make(map[string]int),
				ArchetypeStats: make(map[string]*winLossStats),
				ColorStats:     make(map[string]*winLossStats),
				Opponents:      make(map[string]*Record),
			}
		}
		ps := rows[deck.Player]
		ps.NumDecks++
		ps.Add(deck)
		ps.Trophies += deck.Trophies()
		ps.LastPlace += deck.LastPlace()
		if _, ok := owpAccum[deck.Player]; !ok {
			owpAccum[deck.Player] = &opponentWinAccum{}
		}
		matches := deck.RatedOpponents
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

		addOpponentRecords(ps, deck)

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

	for _, ps := range rows {
		ps.Games = ps.Wins + ps.Losses + ps.Draws
		finishRecord(&ps.Record, z)
		ps.LossPercent = pct(float64(ps.Losses), float64(ps.Games))
		for _, as := range ps.ArchetypeStats {
			finishRecord(&as.Record, z)
		}
		for _, cs := range ps.ColorStats {
			finishRecord(&cs.Record, z)
		}
		for _, or := range ps.Opponents {
			finishRecord(or, z)
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
	}
	return rows
}

// finishRecord computes a player record's win rate, Bayes rate and interval.
func finishRecord(r *Record, z float64) {
	r.Finalize()
	r.SetBayesian(playerBayesPriorGames)
	r.SetInterval(z)
}

// addOpponentRecords adds the deck's game results to the player's record
// against each named opponent. Anonymous seats and unnamed opponents are
// skipped, since they don't name a person.
func addOpponentRecords(ps *PlayerStats, deck *storage.Deck) {
	for _, m := range deck.Matches {
		if m.Opponent == "" || (m.OpponentPlayerID == 0 && players.IsSeatLabel(m.Opponent)) {
			continue
		}
		if _, ok := ps.Opponents[m.Opponent]; !ok {
			ps.Opponents[m.Opponent] = &Record{}
		}
		r := ps.Opponents[m.Opponent]
		r.Wins += m.Wins
		r.Losses += m.Losses
		r.Draws += m.Draws
	}
}
