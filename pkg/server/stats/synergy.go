package stats

import (
	"encoding/json"
	"net/http"
	"sort"

	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

type SynergyStatsRequest struct {
	// Embed deck request to allow filtering by player, date range, and draft size.
	*storage.DecksRequest

	// Minimum number of decks a pair must appear in to be included.
	MinDecks int `json:"min_decks"`
}

type SynergyStatsResponse struct {
	TotalDecks int             `json:"total_decks"`
	Pairs      []SynergyResult `json:"pairs"`
}

type SynergyResult struct {
	Card1        string  `json:"card1"`
	Card2        string  `json:"card2"`
	Count        int     `json:"count"`
	SynergyScore float64 `json:"synergy_score"`
}

type pair struct {
	c1 string
	c2 string
}

func parseSynergyRequest(r *http.Request) *SynergyStatsRequest {
	p := SynergyStatsRequest{}
	p.MinDecks = query.GetInt(r, "min_decks")
	if p.MinDecks == 0 {
		p.MinDecks = 3
	}
	p.DecksRequest = decks.ParseDecksRequest(r)
	return &p
}

func SynergyStatsHandler() http.Handler {
	return &synergyStatsHandler{
		store: storage.NewFileDeckStoreWithCache(),
	}
}

type synergyStatsHandler struct {
	store storage.DeckStorage
}

func (s *synergyStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	sr := parseSynergyRequest(r)
	logrus.WithField("params", sr).Info("/api/stats/synergy")

	// Load the current cube to filter cards.
	cube, err := types.LoadCube("data/polyverse/cube.json")
	if err != nil {
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}
	cubeCards := make(map[string]bool)
	for _, c := range cube.Cards {
		cubeCards[c.Name] = true
	}

	// Load allDecks matching the request.
	allDecks, err := s.store.List(sr.DecksRequest)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	numDecks := len(allDecks)
	cooccurrence := make(map[pair]int)
	cardCounts := make(map[string]int)

	for _, deck := range allDecks {
		cards := []string{}
		seen := make(map[string]bool)
		for _, card := range deck.Mainboard {
			// Skip if not in the current cube.
			if !cubeCards[card.Name] {
				continue
			}
			// Skip all lands.
			if card.IsLand() {
				continue
			}
			if !seen[card.Name] {
				cards = append(cards, card.Name)
				seen[card.Name] = true
				cardCounts[card.Name]++
			}
		}

		sort.Strings(cards)

		for i := 0; i < len(cards); i++ {
			for j := i + 1; j < len(cards); j++ {
				p := pair{c1: cards[i], c2: cards[j]}
				cooccurrence[p]++
			}
		}
	}

	resp := SynergyStatsResponse{
		TotalDecks: numDecks,
		Pairs:      []SynergyResult{},
	}

	for p, count := range cooccurrence {
		if count < sr.MinDecks {
			continue
		}

		probA := float64(cardCounts[p.c1]) / float64(numDecks)
		probB := float64(cardCounts[p.c2]) / float64(numDecks)
		expectedCount := probA * probB * float64(numDecks)

		score := float64(count) / expectedCount
		resp.Pairs = append(resp.Pairs, SynergyResult{
			Card1:        p.c1,
			Card2:        p.c2,
			Count:        count,
			SynergyScore: score,
		})
	}

	// Sort by Synergy Score
	sort.Slice(resp.Pairs, func(i, j int) bool {
		if resp.Pairs[i].SynergyScore == resp.Pairs[j].SynergyScore {
			return resp.Pairs[i].Count > resp.Pairs[j].Count
		}
		return resp.Pairs[i].SynergyScore > resp.Pairs[j].SynergyScore
	})

	// Limit to top 100 for API response sanity.
	if len(resp.Pairs) > 100 {
		resp.Pairs = resp.Pairs[:100]
	}

	// Marshal and write response.
	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	_, err = rw.Write(b)
	if err != nil {
		logrus.WithError(err).Error("could not write response")
	}
}
