package stats

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"

	"github.com/caseydavenport/cube-tools/pkg/server"
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

	// Record filters source decks by match record: "winning" (wins > losses) or
	// "losing" (wins < losses). Any other value uses every deck. Lets the
	// pop/synergy graph compare how cards shift between winning and losing decks.
	Record string `json:"record"`
}

type SynergyStatsResponse struct {
	TotalDecks int             `json:"total_decks"`
	Pairs      []SynergyResult `json:"pairs"`
	FocalStats []CardFocalStat `json:"focal_stats"`

	// CardPlayCounts maps each played card to the number of decks in this pool that
	// mainboarded it. Unlike FocalStats it covers every played card, so the
	// winning-vs-losing comparison can tell "not played here" from "played, no synergy".
	CardPlayCounts map[string]int `json:"card_play_counts"`
}

type CardFocalStat struct {
	CardName       string   `json:"card_name"`
	FocalScore     float64  `json:"focal_score"`
	AvgPartnerLift float64  `json:"avg_partner_lift"`
	DeckCount      int      `json:"deck_count"`
	PlayedDrafts   int      `json:"played_drafts"`
	OpenedDrafts   int      `json:"opened_drafts"`
	TopPartners    []string `json:"top_partners"`
	// TopPartnerSynergies carries the synergy score for each card in TopPartners,
	// in the same order, so the UI can show the partners with their scores without
	// re-deriving them from the (top-100-capped) pairs list.
	TopPartnerSynergies []float64 `json:"top_partner_synergies"`
	// TopPartnerSaturations is the realized fraction for each card in TopPartners,
	// in the same order: how many of the rarer card's decks the pair actually filled
	// (count / min(deckCount of the two cards)). It tells a modest lift on a maxed-out
	// rare pair apart from a modest lift with headroom left.
	TopPartnerSaturations []float64 `json:"top_partner_saturations"`

	// PeakSynergy is a card's single strongest pair. Focal score only measures
	// breadth, so it can't tell a hub from glue (removal scores high off lots of
	// weak pairs). Peak is the depth to tell them apart.
	PeakSynergy float64 `json:"peak_synergy"`
	// PeakSaturation is the realized fraction of the peak pair, the saturation that
	// pairs with PeakSynergy (the y axis of the hub scatter).
	PeakSaturation float64 `json:"peak_saturation"`
}

type SynergyResult struct {
	Card1         string  `json:"card1"`
	Card2         string  `json:"card2"`
	Count         int     `json:"count"`
	EligibleDecks int     `json:"eligible_decks"`
	SynergyScore  float64 `json:"synergy_score"`
	WinPercent    float64 `json:"win_percent"`
	// Saturation is the realized fraction: count / min(deckCount of the two cards).
	// The pair can't co-occur more than the rarer card is played, so this is how much
	// of that ceiling it filled. A modest lift at high saturation is a maxed-out rare
	// pair; the same lift at low saturation has headroom left.
	Saturation float64 `json:"saturation"`
}

type pair struct {
	c1 string
	c2 string
}

// shrinkLift smooths lift toward 1.0 (independence) by adding k pseudo-
// observations to both the observed and expected counts. As the sample
// shrinks the score approaches 1; as it grows it approaches count/expected.
// This keeps low-sample pairs from dominating with extreme lift values.
func shrinkLift(count, expected, k float64) float64 {
	return (count + k) / (expected + k)
}

type pairStats struct {
	count int
	Record
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
		// On the lift scale, 1.0 = independence and 1.5 means a pair
		// co-occurs 50% more than independence would predict.
		p.FocalThreshold = 1.5
	}
	if v, err := strconv.ParseFloat(r.URL.Query().Get("smoothing_k"), 64); err == nil && v >= 0 {
		p.SmoothingK = v
	} else {
		p.SmoothingK = 5.0
	}
	// Default to false; only enable when explicitly set to "true".
	p.ColorAdjust = r.URL.Query().Get("color_adjust") == "true"
	p.Record = r.URL.Query().Get("record")
	p.DecksRequest = decks.ParseDecksRequest(r)
	return &p
}

// filterByRecord narrows decks to those with a winning or losing match record.
// "winning" keeps decks with more match wins than losses, "losing" keeps the
// reverse; even records (and decks that played no matches) fall out of both.
// Any other value returns the decks untouched.
func filterByRecord(in []*storage.Deck, record string) []*storage.Deck {
	if record != "winning" && record != "losing" {
		return in
	}
	out := make([]*storage.Deck, 0, len(in))
	for _, d := range in {
		w, l := d.MatchWins(), d.MatchLosses()
		if (record == "winning" && w > l) || (record == "losing" && w < l) {
			out = append(out, d)
		}
	}
	return out
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
	cubeID := server.CubeFromRequest(r)
	cube, err := types.LoadCube(fmt.Sprintf("data/%s/cube.json", cubeID))
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
	allDecks, err := s.store.List(cubeID, sr.DecksRequest)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}
	allDecks = filterByRecord(allDecks, sr.Record)

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
				cooccurrence[p].Add(deck)
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

	// Measure play rate per draft over the cards actually OPENED that draft, not
	// over the whole cube. This is a singleton cube drafted by 2-8 players, so a
	// small draft only opens a fraction of the cube - counting unopened cards as
	// available would understate play rates for the small-draft era. The opened set
	// is the union of every deck's mainboard, sideboard and pool; "played" means
	// the card made a mainboard. So the rate answers: of the drafts where this card
	// was opened, how often did it get played.
	//
	// Skip pool-only decks (no recorded mainboard, e.g. the Hedron CCC re-imports):
	// they could inflate the opened denominator without ever contributing to the
	// played numerator, dragging down rates for cards in those drafts. Keeping both
	// sides on the same deck population avoids that asymmetry.
	draftDecks := make(map[string][]int)
	for i, deck := range allDecks {
		draftDecks[deck.Metadata.DraftID] = append(draftDecks[deck.Metadata.DraftID], i)
	}

	openedDrafts := make(map[string]int)
	playedDrafts := make(map[string]int)
	for _, idxs := range draftDecks {
		opened := make(map[string]bool)
		played := make(map[string]bool)
		for _, i := range idxs {
			deck := allDecks[i]
			if len(deck.Mainboard) == 0 {
				continue
			}
			// Mainboard cards (already deduped, non-land, in-cube) count as played.
			for name := range deckHasCard[i] {
				played[name] = true
			}
			// Any card seen in a mainboard, sideboard or pool was opened that draft.
			for _, list := range [][]types.Card{deck.Mainboard, deck.Sideboard, deck.Pool} {
				for _, c := range list {
					if !cubeCards[c.Name] || c.IsLand() {
						continue
					}
					opened[c.Name] = true
				}
			}
		}
		for name := range opened {
			openedDrafts[name]++
		}
		for name := range played {
			playedDrafts[name]++
		}
	}

	resp := SynergyStatsResponse{
		TotalDecks:     numDecks,
		Pairs:          []SynergyResult{},
		FocalStats:     []CardFocalStat{},
		CardPlayCounts: cardCounts,
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

		score := shrinkLift(float64(stats.count), expectedCount, k)

		stats.Finalize()

		// Saturation: how much of the rarer card's deck count this pair filled. The
		// pair can't co-occur more than min(countA, countB), so this is its realized
		// fraction of that ceiling.
		saturation := 0.0
		if minCount := min(cardCounts[p.c1], cardCounts[p.c2]); minCount > 0 {
			saturation = float64(stats.count) / float64(minCount)
		}

		result := SynergyResult{
			Card1:         p.c1,
			Card2:         p.c2,
			Count:         stats.count,
			EligibleDecks: eligibleBoth,
			SynergyScore:  score,
			WinPercent:    stats.WinPercent,
			Saturation:    saturation,
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
		qualifying := 0
		topPartners := []string{}
		topPartnerSynergies := []float64{}
		topPartnerSaturations := []float64{}

		// Sort descending by synergy score to pick top partners for display.
		sort.Slice(synergies, func(i, j int) bool {
			return synergies[i].SynergyScore > synergies[j].SynergyScore
		})

		// Strongest pair - slice is already sorted, so grab the first. Not capped
		// like the top-100 pairs, so it sticks around even when a card's pairs don't.
		peakSynergy := 0.0
		peakSaturation := 0.0
		if len(synergies) > 0 {
			peakSynergy = synergies[0].SynergyScore
			peakSaturation = synergies[0].Saturation
		}

		for _, syn := range synergies {
			if syn.SynergyScore < threshold {
				continue
			}
			sumScore += syn.SynergyScore
			qualifying++
			// Collect up to 5 top partners for display. Only partners that
			// contributed to the focal score qualify.
			if len(topPartners) < 5 {
				partner := syn.Card1
				if partner == card {
					partner = syn.Card2
				}
				topPartners = append(topPartners, partner)
				topPartnerSynergies = append(topPartnerSynergies, syn.SynergyScore)
				topPartnerSaturations = append(topPartnerSaturations, syn.Saturation)
			}
		}

		// Average partner lift decouples synergy intensity from partner count.
		// A card with few but very high-lift partners (a narrow build-around)
		// scores high here even if its summed focal score is modest.
		avgLift := 0.0
		if qualifying > 0 {
			avgLift = sumScore / float64(qualifying)
		}

		resp.FocalStats = append(resp.FocalStats, CardFocalStat{
			CardName:              card,
			FocalScore:            sumScore,
			AvgPartnerLift:        avgLift,
			DeckCount:             cardCounts[card],
			PlayedDrafts:          playedDrafts[card],
			OpenedDrafts:          openedDrafts[card],
			TopPartners:           topPartners,
			TopPartnerSynergies:   topPartnerSynergies,
			TopPartnerSaturations: topPartnerSaturations,
			PeakSynergy:           peakSynergy,
			PeakSaturation:        peakSaturation,
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
