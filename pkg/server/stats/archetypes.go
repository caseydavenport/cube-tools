package stats

import (
	"encoding/json"
	"math"
	"net/http"

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
	Type          string         `json:"type"`
	Count         int            `json:"count"`
	Trophies      int            `json:"trophies"`
	LastPlace     int            `json:"last_place"`
	Winning       int            `json:"winning"`
	Losing        int            `json:"losing"`
	AvgCMC        float64        `json:"avg_cmc"`
	BuildPercent  float64        `json:"build_percent"`
	PercentOfWins float64        `json:"percent_of_wins"`
	SharedWith    map[string]int `json:"shared_with"`
	Players       map[string]int `json:"players"`
	AvgShared     float64        `json:"avg_shared"`

	// Internal fields for calculation.
	cmcCount int
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

	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Warn("could not write archetypes response")
	}
}

// archetypeStatsForDecks computes one row per archetype across the given decks:
// the macro archetype and every label. Aggro, midrange and control always get a
// row, even with no decks, so charts can rely on them existing. z is the
// critical value for the win-rate interval.
func archetypeStatsForDecks(allDecks []*storage.Deck, z float64) *ArchetypeStatsResponse {
	resp := &ArchetypeStatsResponse{
		Archetypes: make(map[string]*ArchetypeStats),
	}

	// Initialize macro archetypes.
	macros := []string{"aggro", "midrange", "control"}
	for _, m := range macros {
		resp.Archetypes[m] = &ArchetypeStats{Type: m, SharedWith: make(map[string]int), Players: make(map[string]int)}
	}

	// totalWins counts each game once, for TotalGames. percentOfWinsDenom counts a multi-label deck's wins once per label, like the rows do, so PercentOfWins sums to 100%.
	totalWins := 0
	percentOfWinsDenom := 0
	for _, deck := range allDecks {
		totalWins += deck.GameWins()

		deckLabels := deck.Labels
		if deck.MacroArchetype != "" {
			deckLabels = append(deckLabels, deck.MacroArchetype)
		}
		for _, label := range deckLabels {
			if _, ok := resp.Archetypes[label]; !ok {
				resp.Archetypes[label] = &ArchetypeStats{Type: label, SharedWith: make(map[string]int), Players: make(map[string]int)}
			}
			archetype := resp.Archetypes[label]
			archetype.Count++
			archetype.Add(deck)
			percentOfWinsDenom += deck.GameWins()
			archetype.Trophies += deck.Trophies()
			archetype.LastPlace += deck.LastPlace()
			archetype.Winning += deck.TopHalf()
			archetype.Losing += deck.BottomHalf()

			// Add to the CMC sum (will divide later).
			deckCMC := 0.0
			count := 0
			for _, card := range deck.Mainboard {
				if !card.IsLand() {
					deckCMC += float64(card.CMC)
					count++
				}
			}
			if count > 0 {
				archetype.AvgCMC += deckCMC / float64(count)
				archetype.cmcCount++
			}

			archetype.Players[deck.PersonLabel()]++

			// Track shared labels (secondary tags only; macro archetype excluded).
			for _, other := range deck.Labels {
				if other == label {
					continue
				}
				archetype.SharedWith[other]++
			}
		}
	}

	// Since we iterate all decks, each game is counted once as a win for one deck
	// and once as a loss for the other. Summing only wins avoids double-counting.
	resp.TotalGames = totalWins
	numDecks := len(allDecks)

	for _, as := range resp.Archetypes {
		as.BuildPercent = pct(float64(as.Count), float64(numDecks))
		as.Finalize()
		as.SetBayesian(archetypeBayesPriorGames)
		as.SetInterval(z)
		as.PercentOfWins = pct(float64(as.Wins), float64(percentOfWinsDenom))
		if as.cmcCount > 0 {
			as.AvgCMC = math.Round(as.AvgCMC/float64(as.cmcCount)*100) / 100
		}
		if as.Count > 0 {
			totalShared := 0
			for _, count := range as.SharedWith {
				totalShared += count
			}
			as.AvgShared = math.Round(float64(totalShared)/float64(as.Count)*100) / 100
		}
	}
	return resp
}
