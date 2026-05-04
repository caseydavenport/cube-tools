package stats

import (
	"encoding/json"
	"math"
	"net/http"
	"sort"

	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

type HealthStatsRequest struct {
	*storage.DecksRequest
	BucketSize int  `json:"bucket_size"`
	Sliding    bool `json:"sliding"`
}

type HealthStatsResponse struct {
	Buckets []HealthBucket `json:"buckets"`
}

type HealthBucket struct {
	Name               string  `json:"name"`
	NumDecks           int     `json:"num_decks"`
	ArchetypeEvenness  float64 `json:"archetype_evenness"`
	ColorBalanceStdDev float64 `json:"color_balance_stddev"`
	TrophyGini         float64 `json:"trophy_gini"`
	AvgWordCount       float64 `json:"avg_word_count"`
}

func parseHealthRequest(r *http.Request) *HealthStatsRequest {
	p := HealthStatsRequest{}
	p.BucketSize = query.GetInt(r, "bucket_size")
	if p.BucketSize == 0 {
		p.BucketSize = 5
	}
	p.Sliding = query.GetBool(r, "sliding")
	p.DecksRequest = decks.ParseDecksRequest(r)
	return &p
}

func HealthStatsHandler() http.Handler {
	return &healthStatsHandler{
		store: storage.NewFileDeckStoreWithCache(),
	}
}

type healthStatsHandler struct {
	store storage.DeckStorage
}

func (h *healthStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	sr := parseHealthRequest(r)
	logrus.WithField("params", sr).Info("/api/stats/health")

	allDecks, err := h.store.List(sr.DecksRequest)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	cubeCards := make(map[string]types.Card)
	cube, err := types.LoadCube("data/polyverse/cube.json")
	if err == nil {
		for _, c := range cube.Cards {
			cubeCards[c.Name] = c
		}
	}

	resp := HealthStatsResponse{}
	buckets := decks.DeckBuckets(allDecks, sr.BucketSize, !sr.Sliding)
	for _, b := range buckets {
		bDecks := b.AllDecks()
		hb := HealthBucket{
			Name:     b.Name(),
			NumDecks: len(bDecks),
		}
		hb.ArchetypeEvenness = archetypeEvenness(bDecks)
		hb.ColorBalanceStdDev = colorBalanceStdDev(bDecks)
		hb.TrophyGini = trophyGini(bDecks)
		hb.AvgWordCount = avgWordCount(bDecks, cubeCards)
		resp.Buckets = append(resp.Buckets, hb)
	}

	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	rw.Write(b)
}

// archetypeEvenness computes Shannon entropy of macro archetype distribution,
// normalized by log(4) to produce a 0-1 scale.
func archetypeEvenness(allDecks []*storage.Deck) float64 {
	macros := []string{"aggro", "midrange", "control", "tempo"}
	counts := make(map[string]int)
	for _, m := range macros {
		counts[m] = 0
	}
	total := 0
	for _, d := range allDecks {
		m := d.Macro()
		if m == "" {
			continue
		}
		counts[m]++
		total++
	}
	if total == 0 {
		return 0
	}
	return shannonEvenness(counts, total)
}

// shannonEvenness computes H / H_max where H is Shannon entropy.
func shannonEvenness(counts map[string]int, total int) float64 {
	if total == 0 {
		return 0
	}
	h := 0.0
	for _, c := range counts {
		if c == 0 {
			continue
		}
		p := float64(c) / float64(total)
		h -= p * math.Log(p)
	}
	hMax := math.Log(float64(len(counts)))
	if hMax == 0 {
		return 0
	}
	return math.Round(h/hMax*1000) / 1000
}

// colorBalanceStdDev computes the standard deviation of win rates across
// the 10 dual color pairs.
func colorBalanceStdDev(allDecks []*storage.Deck) float64 {
	dualColors := []string{"WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG"}
	wins := make(map[string]int)
	losses := make(map[string]int)

	for _, d := range allDecks {
		colors := d.GetColors()
		if len(colors) != 2 {
			continue
		}
		sort.Slice(colors, func(i, j int) bool {
			order := "WUBRG"
			return indexOf(order, colors[i]) < indexOf(order, colors[j])
		})
		pair := colors[0] + colors[1]
		wins[pair] += d.GameWins()
		losses[pair] += d.GameLosses()
	}

	// Compute win rates for pairs that have games.
	var rates []float64
	for _, c := range dualColors {
		total := wins[c] + losses[c]
		if total > 0 {
			rates = append(rates, float64(wins[c])/float64(total))
		}
	}

	if len(rates) < 2 {
		return 0
	}

	// Compute standard deviation.
	mean := 0.0
	for _, r := range rates {
		mean += r
	}
	mean /= float64(len(rates))

	variance := 0.0
	for _, r := range rates {
		diff := r - mean
		variance += diff * diff
	}
	variance /= float64(len(rates))

	return math.Round(math.Sqrt(variance)*1000) / 1000
}

func indexOf(s, sub string) int {
	for i := range s {
		if string(s[i]) == sub {
			return i
		}
	}
	return -1
}

// trophyGini computes the Gini coefficient of trophy counts across macro archetypes.
func trophyGini(allDecks []*storage.Deck) float64 {
	macros := []string{"aggro", "midrange", "control", "tempo"}
	trophyCounts := make(map[string]int)
	for _, m := range macros {
		trophyCounts[m] = 0
	}
	for _, d := range allDecks {
		m := d.Macro()
		if m == "" {
			continue
		}
		trophyCounts[m] += d.Trophies()
	}

	values := make([]float64, 0, len(macros))
	for _, m := range macros {
		values = append(values, float64(trophyCounts[m]))
	}
	return giniCoefficient(values)
}

// avgWordCount computes the average word count per non-land card across all
// mainboarded cards in the given decks.
func avgWordCount(allDecks []*storage.Deck, cubeCards map[string]types.Card) float64 {
	totalWords := 0
	totalCards := 0
	for _, d := range allDecks {
		for _, card := range d.Mainboard {
			if card.IsBasicLand() || card.IsLand() {
				continue
			}
			if cc, ok := cubeCards[card.Name]; ok {
				totalWords += cc.WordCount()
			} else {
				totalWords += card.WordCount()
			}
			totalCards++
		}
	}
	if totalCards == 0 {
		return 0
	}
	return math.Round(float64(totalWords)/float64(totalCards)*100) / 100
}

// giniCoefficient computes the Gini coefficient for a slice of values.
func giniCoefficient(values []float64) float64 {
	n := len(values)
	if n == 0 {
		return 0
	}

	sort.Float64s(values)

	sum := 0.0
	for _, v := range values {
		sum += v
	}
	if sum == 0 {
		return 0
	}

	// Gini = (2 * sum(i * y_i) - (n+1) * sum(y_i)) / (n * sum(y_i))
	// where y_i are sorted values and i is 1-indexed.
	numerator := 0.0
	for i, v := range values {
		numerator += float64(i+1) * v
	}
	gini := (2*numerator - float64(n+1)*sum) / (float64(n) * sum)
	return math.Round(gini*1000) / 1000
}
