package stats

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"

	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

type SynergyStatsRequest struct {
	// Embed deck request to allow filtering by player, date range, and draft size.
	*storage.DecksRequest

	// Minimum number of decks a pair must appear in to be included in results.
	MinDecks int `json:"min_decks"`

	// Minimum synergy score a partner must have to count toward a card's focal
	// score. The focal score sums all partner synergy scores above this threshold,
	// so lowering it includes weaker synergies and raising it focuses on strong ones.
	FocalThreshold float64 `json:"focal_threshold"`

	// Bayesian shrinkage constant. Acts as a pseudo-count pulling lift scores
	// toward the baseline of 1.0 (statistical independence). Higher values dampen
	// noisy estimates from low-sample pairs. Set to 0 for no smoothing.
	SmoothingK float64 `json:"smoothing_k"`

	// When true, restrict the expected co-occurrence baseline to decks where both
	// cards are castable, preventing same-color pairs from getting inflated scores.
	ColorAdjust bool `json:"color_adjust"`
}

type SynergyStatsResponse struct {
	TotalDecks int             `json:"total_decks"`
	Pairs      []SynergyResult `json:"pairs"`
	FocalStats []CardFocalStat `json:"focal_stats"`
}

type CardFocalStat struct {
	CardName    string   `json:"card_name"`
	FocalScore  float64  `json:"focal_score"`
	TopPartners []string `json:"top_partners"`
}

type SynergyResult struct {
	Card1        string  `json:"card1"`
	Card2        string  `json:"card2"`
	Count        int     `json:"count"`
	EligibleDecks int    `json:"eligible_decks"`
	SynergyScore float64 `json:"synergy_score"`
	WinPercent   float64 `json:"win_percent"`
}

type pair struct {
	c1 string
	c2 string
}

type pairStats struct {
	count  int
	wins   int
	losses int
}

func parseSynergyRequest(r *http.Request) *SynergyStatsRequest {
	p := SynergyStatsRequest{}
	p.MinDecks = query.GetInt(r, "min_decks")
	if p.MinDecks == 0 {
		p.MinDecks = 3
	}
	if v, err := strconv.ParseFloat(r.URL.Query().Get("focal_threshold"), 64); err == nil && v > 0 {
		p.FocalThreshold = v
	} else {
		p.FocalThreshold = 5.0
	}
	if v, err := strconv.ParseFloat(r.URL.Query().Get("smoothing_k"), 64); err == nil && v >= 0 {
		p.SmoothingK = v
	} else {
		p.SmoothingK = 5.0
	}
	// Default to false; only enable when explicitly set to "true".
	p.ColorAdjust = r.URL.Query().Get("color_adjust") == "true"
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
	cubeCardMap := make(map[string]types.Card)
	for _, c := range cube.Cards {
		cubeCards[c.Name] = true
		cubeCardMap[c.Name] = c
	}

	// Load allDecks matching the request.
	allDecks, err := s.store.List(sr.DecksRequest)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	numDecks := len(allDecks)
	cooccurrence := make(map[pair]*pairStats)
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
				if _, ok := cooccurrence[p]; !ok {
					cooccurrence[p] = &pairStats{}
				}
				cooccurrence[p].count++
				cooccurrence[p].wins += deck.GameWins()
				cooccurrence[p].losses += deck.GameLosses()
			}
		}
	}

	// Pre-compute per-deck lookups for color-adjusted expected counts.
	// deckHasCard[i][name] = true if deck i contains that tracked card.
	// deckCanCast[i][name] = true if deck i can cast that card (colors are a subset).
	trackedCards := make([]string, 0, len(cardCounts))
	for name := range cardCounts {
		trackedCards = append(trackedCards, name)
	}
	deckHasCard := make([]map[string]bool, numDecks)
	deckCanCast := make([]map[string]bool, numDecks)
	for i, deck := range allDecks {
		hasCard := make(map[string]bool)
		canCast := make(map[string]bool)
		seen := make(map[string]bool)
		for _, card := range deck.Mainboard {
			if !cubeCards[card.Name] || card.IsLand() || seen[card.Name] {
				continue
			}
			seen[card.Name] = true
			if cardCounts[card.Name] > 0 {
				hasCard[card.Name] = true
			}
		}
		for _, name := range trackedCards {
			if c, ok := cubeCardMap[name]; ok && deck.CanCast(c) {
				canCast[name] = true
			}
		}
		deckHasCard[i] = hasCard
		deckCanCast[i] = canCast
	}

	resp := SynergyStatsResponse{
		TotalDecks: numDecks,
		Pairs:      []SynergyResult{},
		FocalStats: []CardFocalStat{},
	}

	// Temporary map to hold synergy scores for each card.
	cardSynergies := make(map[string][]SynergyResult)

	k := sr.SmoothingK

	for p, stats := range cooccurrence {
		if stats.count < sr.MinDecks {
			continue
		}

		var expectedCount float64
		eligibleBoth := numDecks

		if sr.ColorAdjust {
			// Color-adjusted lift: restrict the independence baseline to decks where
			// both cards are castable. This prevents same-color pairs from getting
			// inflated scores simply because colored cards co-occur in their color's decks.
			eligibleBoth = 0
			countAe := 0
			countBe := 0
			for i := range allDecks {
				if deckCanCast[i][p.c1] && deckCanCast[i][p.c2] {
					eligibleBoth++
					if deckHasCard[i][p.c1] {
						countAe++
					}
					if deckHasCard[i][p.c2] {
						countBe++
					}
				}
			}

			if eligibleBoth == 0 {
				continue
			}
			expectedCount = float64(countAe) * float64(countBe) / float64(eligibleBoth)
		} else {
			// Global independence baseline: P(A) * P(B) * N.
			probA := float64(cardCounts[p.c1]) / float64(numDecks)
			probB := float64(cardCounts[p.c2]) / float64(numDecks)
			expectedCount = probA * probB * float64(numDecks)
		}

		if expectedCount == 0 {
			continue
		}

		rawLift := float64(stats.count) / expectedCount

		// Bayesian shrinkage toward 1.0 (independence). We mix in K
		// pseudo-observations at lift=1.0: score = (n*lift + k*1) / (n+k).
		// This prevents low-sample pairs from dominating with extreme lift values.
		score := (float64(stats.count)*rawLift + k*1.0) / (float64(stats.count) + k)

		winPercent := 0.0
		if stats.wins+stats.losses > 0 {
			winPercent = 100 * float64(stats.wins) / float64(stats.wins+stats.losses)
		}

		result := SynergyResult{
			Card1:         p.c1,
			Card2:         p.c2,
			Count:         stats.count,
			EligibleDecks: eligibleBoth,
			SynergyScore:  score,
			WinPercent:    winPercent,
		}

		resp.Pairs = append(resp.Pairs, result)

		// Collect synergies for focal score calculation
		cardSynergies[p.c1] = append(cardSynergies[p.c1], result)
		cardSynergies[p.c2] = append(cardSynergies[p.c2], result)
	}

	// Calculate Focal Score for each card. The focal score sums synergy scores for
	// all partners above the threshold, identifying "build-around" cards that have
	// many strong synergies. A high focal score means the card is a hub in the
	// synergy network — it pulls you into a specific archetype when drafted.
	for card, synergies := range cardSynergies {
		threshold := sr.FocalThreshold
		sumScore := 0.0
		topPartners := []string{}

		// Sort descending by synergy score to pick top partners for display.
		sort.Slice(synergies, func(i, j int) bool {
			return synergies[i].SynergyScore > synergies[j].SynergyScore
		})

		for _, syn := range synergies {
			if syn.SynergyScore >= threshold {
				sumScore += syn.SynergyScore
			}
			// Collect up to 5 top partners for display.
			if len(topPartners) < 5 {
				partner := syn.Card1
				if partner == card {
					partner = syn.Card2
				}
				topPartners = append(topPartners, partner)
			}
		}

		resp.FocalStats = append(resp.FocalStats, CardFocalStat{
			CardName:    card,
			FocalScore:  sumScore,
			TopPartners: topPartners,
		})
	}

	// Sort FocalStats by FocalScore descending
	sort.Slice(resp.FocalStats, func(i, j int) bool {
		return resp.FocalStats[i].FocalScore > resp.FocalStats[j].FocalScore
	})

	// Sort pairs by Synergy Score
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
