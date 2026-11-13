package stats

import (
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// playerBayesPriorGames is the coin-flip games mixed into a player's Bayes
// rate. On polyverse (2026-10-29) players with 10+ games differ by about 9
// points beyond chance, which fits about 31.
const playerBayesPriorGames = 30

// PlayerStatsResponse is the players payload: rows for all matching decks, or one set of rows per time bucket.
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

// PlayerStats is one player's record, deck results and color and archetype tendencies across the matching decks.
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

	// opponentWinSum is the decks' opponent win percentages, each weighted by
	// its deck's rated opponents, and numRatedOpponents is the sum of those
	// weights. OpponentWinPercent is their quotient.
	opponentWinSum    float64
	numRatedOpponents int
}

// winLossStats is a player's record with the decks of one archetype or color,
// and how many decks that is.
type winLossStats struct {
	Record
	Count int `json:"count"`
}

// PlayerStatsHandler serves one row per named player, with their records and
// what they tend to draft. store and src also supply the packages and each
// draft's cube list that tendencies compare against.
func PlayerStatsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &playerStatsHandler{q: deckquery.New(store, src), store: store, src: src}
}

type playerStatsHandler struct {
	q     *deckquery.Query
	store storage.DeckStorage
	src   types.CubeSource
}

// ServeHTTP computes the player statistics for the request and writes them as JSON.
func (s *playerStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	decksReq := decks.ParseDecksRequest(r)
	logrus.WithField("params", decksReq).Info("/api/stats/players")

	cubeID := server.CubeFromRequest(r)
	bucketSize := query.GetInt(r, "bucket_size")

	// The tendency baseline loads before the filtered decks, so the filtered
	// decks are the handler's last read, as on every stats page.
	var baseline *tendencyBaseline
	if bucketSize <= 0 {
		var err error
		baseline, err = s.loadBaseline(cubeID, decksReq)
		if err != nil {
			logrus.WithError(err).Error("could not load the player tendency baseline")
			http.Error(rw, "could not load decks", http.StatusInternalServerError)
			return
		}
	}

	allDecks, err := s.q.Decks(cubeID, decksReq)
	if err != nil {
		logrus.WithError(err).Error("could not load decks for player stats")
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

	writeJSON(rw, resp, "players")
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
	rules, err := rulebook.Load(s.store, s.src, cubeID)
	if err != nil {
		logrus.WithError(err).Warn("could not load packages for player tendencies")
		return &tendencyBaseline{decks: withSpells(all), cubes: cubeLists{}}, nil
	}
	return &tendencyBaseline{decks: withSpells(all), packages: rules.Packages(), cubes: cubeLists(rules.DraftLists())}, nil
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

// playerRows aggregates decks into one row per named player, with per-archetype,
// per-color and per-opponent records. Every record gets its Bayes rate and an
// interval at critical value z. Anonymous seats belong to no player.
func playerRows(allDecks []*storage.Deck, z float64) map[string]*PlayerStats {
	rows := make(map[string]*PlayerStats)
	for _, deck := range allDecks {
		// Seat labels repeat in every draft, so anonymous decks belong to no
		// player. Names are unique, so keying by name keeps people apart.
		if deck.IsAnonymous() {
			continue
		}
		if _, ok := rows[deck.Player]; !ok {
			rows[deck.Player] = newPlayerStats(deck)
		}
		rows[deck.Player].addDeck(deck)
	}
	for _, row := range rows {
		row.finish(z)
	}
	return rows
}

// newPlayerStats returns an empty row for the player who played deck.
func newPlayerStats(deck *storage.Deck) *PlayerStats {
	return &PlayerStats{
		ID:             deck.PlayerID,
		Name:           deck.Player,
		UniqueCards:    make(map[string]int),
		ColorPicks:     make(map[string]int),
		ArchetypeStats: make(map[string]*winLossStats),
		ColorStats:     make(map[string]*winLossStats),
		Opponents:      make(map[string]*Record),
	}
}

// addDeck adds one of the player's decks to the row's counts. The rates are
// left for finish.
func (p *PlayerStats) addDeck(deck *storage.Deck) {
	p.NumDecks++
	p.Add(deck)
	p.Trophies += deck.Trophies()
	p.LastPlace += deck.LastPlace()
	if deck.RatedOpponents > 0 {
		p.opponentWinSum += deck.OpponentWinPercentage * float64(deck.RatedOpponents)
		p.numRatedOpponents += deck.RatedOpponents
	}

	// Archetype records cover the macro archetype and every tag.
	for _, label := range deck.GetLabels() {
		addToWinLoss(p.ArchetypeStats, strings.ToLower(label), deck)
	}
	for color := range deck.GetColors() {
		addToWinLoss(p.ColorStats, color, deck)
	}

	addOpponentRecords(p, deck)

	for _, card := range deck.Mainboard {
		if card.IsBasicLand() {
			continue
		}
		p.TotalPicks++
		p.UniqueCards[card.Name]++
		for _, color := range card.Colors {
			p.ColorPicks[color]++
		}
	}
}

// finish derives the row's rates from the counts addDeck gathered. z is the
// critical value for the win-rate intervals.
func (p *PlayerStats) finish(z float64) {
	p.Games = p.Wins + p.Losses + p.Draws
	finishRecord(&p.Record, z)
	p.LossPercent = pct(float64(p.Losses), float64(p.Games))
	for _, row := range p.ArchetypeStats {
		finishRecord(&row.Record, z)
	}
	for _, row := range p.ColorStats {
		finishRecord(&row.Record, z)
	}
	for _, opponentRecord := range p.Opponents {
		finishRecord(opponentRecord, z)
	}
	if p.numRatedOpponents > 0 {
		// opponentWinSum is already a percentage; just round to 2 decimals.
		p.OpponentWinPercent = math.Round(100*p.opponentWinSum/float64(p.numRatedOpponents)) / 100
	}
	p.WhitePercent = pct(float64(p.ColorPicks["W"]), float64(p.TotalPicks))
	p.BluePercent = pct(float64(p.ColorPicks["U"]), float64(p.TotalPicks))
	p.BlackPercent = pct(float64(p.ColorPicks["B"]), float64(p.TotalPicks))
	p.RedPercent = pct(float64(p.ColorPicks["R"]), float64(p.TotalPicks))
	p.GreenPercent = pct(float64(p.ColorPicks["G"]), float64(p.TotalPicks))
}

// addToWinLoss adds the deck to the record under key, creating it on first use.
func addToWinLoss(records map[string]*winLossStats, key string, deck *storage.Deck) {
	if _, ok := records[key]; !ok {
		records[key] = &winLossStats{}
	}
	records[key].Add(deck)
	records[key].Count++
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
