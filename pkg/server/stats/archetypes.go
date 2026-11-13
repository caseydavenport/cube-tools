package stats

import (
	"net/http"
	"slices"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// archetypeBayesPriorGames is how many coin-flip games the archetype Bayesian
// win rate mixes in. On polyverse in October 2026, labels differed by about 5
// points beyond chance, which fits a prior of about 90 games.
const archetypeBayesPriorGames = 90

// macroArchetypes are the archetypes every archetype listing has a row for, and
// the Deck Stats charts split decks by, in the order the charts show them.
var macroArchetypes = []string{"aggro", "midrange", "control"}

// ArchetypeStatsResponse is the archetypes payload: rows for all matching decks, or one set of rows per time bucket.
type ArchetypeStatsResponse struct {
	TotalGames int                        `json:"total_games"`
	Archetypes map[string]*ArchetypeStats `json:"archetypes"`

	// Buckets holds one set of archetype rows per time bucket when the request
	// sets bucket_size. The top-level fields are empty then.
	Buckets []*ArchetypeBucket `json:"buckets,omitempty"`
}

// ArchetypeBucket is the archetype rows for one time bucket of drafts.
type ArchetypeBucket struct {
	Archetypes map[string]*ArchetypeStats `json:"archetypes"`

	// Name labels the bucket by the dates it spans.
	Name string `json:"name"`

	// Start is the bucket's first draft date, used as the x-axis label.
	Start string `json:"start"`
}

// ArchetypeStats is the win record and shape of one archetype label across the matching decks.
type ArchetypeStats struct {
	Record

	// Type is the archetype or tag the row is for.
	Type string `json:"type"`

	// Count is the number of decks carrying the label.
	Count int `json:"count"`

	Trophies  int `json:"trophies"`
	LastPlace int `json:"last_place"`

	// Winning and Losing count the decks with more match wins than losses, and more losses than wins.
	Winning int `json:"winning"`
	Losing  int `json:"losing"`

	// AvgCMC is the mean of the decks' average mana values, over decks with a nonland card.
	AvgCMC float64 `json:"avg_cmc"`

	BuildPercent  float64 `json:"build_percent"`
	PercentOfWins float64 `json:"percent_of_wins"`

	// SharedWith counts the other tags the label's decks carry, and Players counts the decks per player.
	SharedWith map[string]int `json:"shared_with"`
	Players    map[string]int `json:"players"`

	// AvgShared is the mean number of other tags per deck.
	AvgShared float64 `json:"avg_shared"`

	// numCMCDecks is how many decks AvgCMC sums over, until it's averaged.
	numCMCDecks int
}

// ArchetypeStatsHandler serves per-archetype statistics for the requested cube and decks.
func ArchetypeStatsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &archetypeStatsHandler{q: deckquery.New(store, src)}
}

type archetypeStatsHandler struct {
	q *deckquery.Query
}

// ServeHTTP computes the archetype statistics for the request and writes them as JSON.
func (s *archetypeStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/stats/archetypes")

	cubeID := server.CubeFromRequest(r)
	allDecks, err := s.q.Decks(cubeID, dr)
	if err != nil {
		logrus.WithError(err).Error("could not load decks for archetype stats")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	z := zForConfidence(query.GetFloat(r, "confidence"))
	resp := ArchetypeStatsResponse{}
	bucketSize := query.GetInt(r, "bucket_size")
	if bucketSize > 0 {
		buckets := decks.DeckBuckets(allDecks, bucketSize, !query.GetBool(r, "sliding"))
		for _, b := range buckets {
			stats := archetypeStatsForDecks(b.AllDecks(), z)
			resp.Buckets = append(resp.Buckets, &ArchetypeBucket{
				Archetypes: stats.Archetypes,
				Name:       b.Name(),
				Start:      b.Start(),
			})
		}
	} else {
		resp = *archetypeStatsForDecks(allDecks, z)
	}

	writeJSON(rw, resp, "archetypes")
}

// archetypeStatsForDecks computes one row per archetype across the given decks:
// the macro archetype and every label. Aggro, midrange and control always get a
// row, even with no decks, so charts can rely on them existing. z is the
// critical value for the win-rate interval.
func archetypeStatsForDecks(allDecks []*storage.Deck, z float64) *ArchetypeStatsResponse {
	resp := &ArchetypeStatsResponse{
		Archetypes: make(map[string]*ArchetypeStats),
	}
	for _, macro := range macroArchetypes {
		resp.Archetypes[macro] = newArchetypeStats(macro)
	}

	// totalWins counts each game once, as a win for one deck, for TotalGames.
	totalWins := 0

	// percentOfWinsDenominator counts a multi-label deck's wins once per label,
	// like the rows do, so PercentOfWins sums to 100%.
	percentOfWinsDenominator := 0
	for _, deck := range allDecks {
		totalWins += deck.GameWins()
		for _, label := range deck.GetLabels() {
			if _, ok := resp.Archetypes[label]; !ok {
				resp.Archetypes[label] = newArchetypeStats(label)
			}
			resp.Archetypes[label].addDeck(deck)
			percentOfWinsDenominator += deck.GameWins()
		}
	}
	resp.TotalGames = totalWins

	for _, row := range resp.Archetypes {
		row.BuildPercent = pct(float64(row.Count), float64(len(allDecks)))
		row.Finalize()
		row.SetBayesian(archetypeBayesPriorGames)
		row.SetInterval(z)
		row.PercentOfWins = pct(float64(row.Wins), float64(percentOfWinsDenominator))
		if row.numCMCDecks > 0 {
			row.AvgCMC = round2(row.AvgCMC / float64(row.numCMCDecks))
		}
		if row.Count > 0 {
			totalShared := 0
			for _, count := range row.SharedWith {
				totalShared += count
			}
			row.AvgShared = round2(float64(totalShared) / float64(row.Count))
		}
	}
	return resp
}

// newArchetypeStats returns an empty row for the named archetype or tag.
func newArchetypeStats(name string) *ArchetypeStats {
	return &ArchetypeStats{Type: name, SharedWith: make(map[string]int), Players: make(map[string]int)}
}

// addDeck adds one deck to the row. AvgCMC holds a sum of per-deck averages
// until archetypeStatsForDecks divides it by numCMCDecks.
func (a *ArchetypeStats) addDeck(deck *storage.Deck) {
	a.Count++
	a.Add(deck)
	a.Trophies += deck.Trophies()
	a.LastPlace += deck.LastPlace()
	a.Winning += deck.TopHalf()
	a.Losing += deck.BottomHalf()

	// A deck of only lands has no mana value to average.
	if slices.ContainsFunc(deck.Mainboard, func(c types.Card) bool { return !c.IsLand() }) {
		a.AvgCMC += avgManaValue(deck)
		a.numCMCDecks++
	}

	a.Players[deck.PersonLabel()]++

	// Shared labels are the deck's tags only: the macro archetype is left out.
	for _, other := range deck.Labels {
		if other != a.Type {
			a.SharedWith[other]++
		}
	}
}
