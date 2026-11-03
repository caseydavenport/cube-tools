package stats

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
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

	// Tendencies is what the player tends to draft. Bucketed responses leave
	// it empty.
	Tendencies PlayerTendencies `json:"tendencies"`
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

// PlayerStatsHandler serves one row per named player, with their records and
// what they tend to draft. store and src also supply the packages and each
// draft's cube list that tendencies compare against.
func PlayerStatsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &playerStatsHandler{q: newQuery(store, src), store: store, src: src}
}

type playerStatsHandler struct {
	q     *deckquery.Query
	store storage.DeckStorage
	src   types.CubeSource
}

func (s *playerStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/stats/players")

	cubeID := server.CubeFromRequest(r)
	bucketSize := query.GetInt(r, "bucket_size")

	// The tendency baseline loads before the filtered decks, so the filtered
	// decks are the handler's last read, as on every stats page.
	var baseline *tendencyBaseline
	if bucketSize <= 0 {
		var err error
		baseline, err = s.loadBaseline(cubeID, dr)
		if err != nil {
			logrus.WithError(err).Error("could not load the player tendency baseline")
			http.Error(rw, "could not load decks", http.StatusInternalServerError)
			return
		}
	}

	allDecks, err := s.q.Decks(cubeID, dr)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	z := zForConfidence(query.GetFloat(r, "confidence"))
	resp := PlayerStatsResponse{}
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
		baseline.addTendencies(allDecks, resp.Players)
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

// tendencyBaseline is what player tendencies are compared against: every deck
// in the request's date range, without its deck filter, the cube's packages,
// and each draft's cube list.
type tendencyBaseline struct {
	decks    []deckSpells
	packages []design.PackageCards
	cubes    cubeLists
}

// loadBaseline reads the tendency baseline for the request. Leaving out the
// deck filter means filtering to one player still leaves everyone else to
// compare with. Missing packages only empty that section, so they're logged.
func (s *playerStatsHandler) loadBaseline(cubeID string, dr *storage.DecksRequest) (*tendencyBaseline, error) {
	all, err := s.q.Decks(cubeID, &storage.DecksRequest{Start: dr.Start, End: dr.End, DraftSize: dr.DraftSize})
	if err != nil {
		return nil, fmt.Errorf("load baseline decks: %w", err)
	}
	pkgs, err := PackagesForCube(s.store, s.src, cubeID)
	if err != nil {
		logrus.WithError(err).Warn("could not load packages for player tendencies")
	}
	return &tendencyBaseline{decks: withSpells(all), packages: pkgs, cubes: loadCubeLists(s.store, cubeID, all)}, nil
}

// addTendencies fills each row's Tendencies from the player's decks in mine.
func (b *tendencyBaseline) addTendencies(mine []*storage.Deck, rows map[string]*PlayerStats) {
	byPlayer := map[string][]*storage.Deck{}
	for _, d := range mine {
		if _, ok := rows[d.Player]; ok {
			byPlayer[d.Player] = append(byPlayer[d.Player], d)
		}
	}
	for name, row := range rows {
		row.Tendencies = playerTendencies(name, byPlayer[name], b.decks, b.packages, b.cubes)
	}
}

// loadCubeLists reads the cube list each of the decks' drafts was played
// with. A draft without one, or with an empty one, is left out, which counts
// every card as available there.
func loadCubeLists(store storage.DeckStorage, cubeID string, decks []*storage.Deck) cubeLists {
	lists := cubeLists{}
	tried := map[int]bool{}
	for _, d := range decks {
		draftID := d.Metadata.DraftID
		if tried[draftID] {
			continue
		}
		tried[draftID] = true
		if names, _ := snapshotNames(store, cubeID, draftID); names != nil {
			lists[draftID] = names
		}
	}
	return lists
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
		stats := rows[deck.Player]
		stats.NumDecks++
		stats.Add(deck)
		stats.Trophies += deck.Trophies()
		stats.LastPlace += deck.LastPlace()
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
			if _, ok := stats.ArchetypeStats[l]; !ok {
				stats.ArchetypeStats[l] = &winLossStats{}
			}
			as := stats.ArchetypeStats[l]
			as.Add(deck)
			as.Count++
		}

		// Track color identity win/loss for the player.
		colors := deck.GetColors()
		for color := range colors {
			if _, ok := stats.ColorStats[color]; !ok {
				stats.ColorStats[color] = &winLossStats{}
			}
			cs := stats.ColorStats[color]
			cs.Add(deck)
			cs.Count++
		}

		addOpponentRecords(stats, deck)

		for _, card := range deck.Mainboard {
			if card.IsBasicLand() {
				continue
			}
			stats.TotalPicks++
			stats.UniqueCards[card.Name]++
			for _, color := range card.Colors {
				stats.ColorPicks[color]++
			}
		}
	}

	// Derive each player's rates from the accumulated counts.
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
		for _, opponentRecord := range ps.Opponents {
			finishRecord(opponentRecord, z)
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
