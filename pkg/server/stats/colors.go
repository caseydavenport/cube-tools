package stats

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/sirupsen/logrus"
	"gonum.org/v1/gonum/stat"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

type colorMode string

const (
	// ColorModeInclusive counts a deck as contributing to all of its sub-identities (e.g., a WU deck counts as W, U, and WU).
	ColorModeInclusive colorMode = "inclusive"

	// ColorModeExact counts a deck only for its exact color identity (e.g., a WU deck counts only as WU).
	ColorModeExact colorMode = "exact"

	// ColorModePrimary counts a deck for its exact color identity, but a 3+ color deck with a clear primary pair counts as that pair (WUB with primary pair WU counts as WU).
	ColorModePrimary colorMode = "primary"
)

// bayesPriorGames returns how many coin-flip games the Bayesian win rate mixes
// in for a color mode. Measured on polyverse in October 2026: exact rows differ
// by about 6 points beyond chance, which fits a 60-game prior. Inclusive rows
// differ by about 2 points, which fits about 600. Primary pairs showed no spread
// beyond chance, so they share the inclusive prior.
func bayesPriorGames(mode colorMode) float64 {
	if mode == ColorModeExact {
		return 60
	}
	return 600
}

// ColorStatsRequest holds the query parameters of the colors stats endpoint: the deck filters plus bucketing, color mode and confidence.
type ColorStatsRequest struct {
	// Embed deck request to allow filtering by player, date range, and draft size.
	*storage.DecksRequest

	// Configuration for bucketed responses.
	BucketSize int  `json:"bucket_size"`
	Sliding    bool `json:"sliding"`

	// ColorMode controls how decks are bucketed by color identity.
	ColorMode colorMode `json:"color_mode"`

	// Confidence level for the win-rate interval (0,1). Defaults to
	// defaultConfidence. See confidence.go.
	Confidence float64 `json:"confidence"`
}

// ColorStatsResponse is the colors stats payload: one aggregate over all matching decks, or one entry per time bucket.
type ColorStatsResponse struct {
	// Aggregated stats for each card across all decks matching the request.
	All *Colors `json:"all"`

	// If bucketed response, then bucketed response data corresponding to the request.
	Buckets []*ColorBucket `json:"buckets,omitempty"`
}

// ColorBucket is the color statistics for one time bucket of decks.
type ColorBucket struct {
	// Inline the cards data.
	Colors `json:",inline"`

	// Include metadata about the bucket.
	Name string `json:"name"`

	// Start is the bucket's starting date, used as the x-axis label.
	Start string `json:"start"`

	// Total number of games in this bucket.
	Games int `json:"games,omitempty"`
}

func parseColorsRequest(r *http.Request) *ColorStatsRequest {
	// Pull deck params from the request.
	p := ColorStatsRequest{}
	p.BucketSize = query.GetInt(r, "bucket_size")
	p.Sliding = query.GetBool(r, "sliding")
	p.ColorMode = colorMode(r.URL.Query().Get("color_mode"))
	if p.ColorMode == "" {
		p.ColorMode = ColorModeExact
	}
	p.Confidence = query.GetFloat(r, "confidence")

	// Parse the embedded deck request.
	p.DecksRequest = decks.ParseDecksRequest(r)

	return &p
}

func validateColorsRequest(r ColorStatsRequest) error {
	if r.ColorMode != ColorModeInclusive && r.ColorMode != ColorModeExact && r.ColorMode != ColorModePrimary {
		return fmt.Errorf("invalid color_mode: %s", r.ColorMode)
	}
	if r.Confidence < 0 || r.Confidence > 1 {
		return fmt.Errorf("invalid confidence: %f", r.Confidence)
	}
	return nil
}

// ColorStatsHandler serves per-color win and pick statistics for the requested cube and decks.
func ColorStatsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &colorStatsHandler{q: deckquery.New(store, src)}
}

type colorStatsHandler struct {
	q *deckquery.Query
}

// ServeHTTP computes the color statistics for the request and writes them as JSON.
func (d *colorStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	statsReq := parseColorsRequest(r)
	if err := validateColorsRequest(*statsReq); err != nil {
		logrus.WithError(err).WithField("params", statsReq).Warn("invalid request")
		http.Error(rw, err.Error(), http.StatusBadRequest)
		return
	}

	logrus.WithField("params", statsReq).Info("/api/stats/cards")

	cubeID := server.CubeFromRequest(r)
	resp := ColorStatsResponse{}

	// Load allDecks matching the request.
	allDecks, err := d.q.Decks(cubeID, statsReq.DecksRequest)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Initialize the response structure.
	resp = ColorStatsResponse{}
	if statsReq.BucketSize > 0 {
		// If bucket size is set, then create bucketed response.
		buckets := decks.DeckBuckets(allDecks, statsReq.BucketSize, !statsReq.Sliding)
		logrus.WithFields(logrus.Fields{
			"num_buckets": len(buckets),
			"num_decks":   len(allDecks),
		}).Info("Created buckets for response")
		for _, b := range buckets {
			s := d.statsForDecks(b.AllDecks(), statsReq)
			resp.Buckets = append(resp.Buckets, &ColorBucket{
				Colors: *s,
				Name:   b.Name(),
				Start:  b.Start(),
				Games:  b.TotalGames(),
			})
		}
	} else {
		resp.All = d.statsForDecks(allDecks, statsReq)
	}

	// Print out correlation coefficients between color pick percentages and win percentages.
	// d.printCorrelations(resp)

	// Marshal the response and write it back.
	b, err := json.Marshal(resp)
	if err != nil {
		logrus.WithError(err).Error("could not marshal response")
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	_, err = rw.Write(b)
	if err != nil {
		panic(err)
	}
}

// printCorrelations calculates and prints correlation coefficients between color pick percentages
// and win percentages, both overall and over time if bucketed data is available.
func (d *colorStatsHandler) printCorrelations(resp ColorStatsResponse) {
	// Build arrays of pick and win percentages for each of WUBRG, to correlate how often a color is drafted with how well it performs.
	picks := []float64{}
	wins := []float64{}
	colors := []string{"W", "U", "B", "R", "G"}

	if resp.All != nil {
		for _, color := range colors {
			if c, ok := resp.All.Data[color]; ok {
				picks = append(picks, c.TotalPickPercentage)
				wins = append(wins, c.WinPercent)
			} else {
				picks = append(picks, 0)
				wins = append(wins, 0)
			}
		}

		// Perform the correlation calculation for the above arrays.
		R := stat.Correlation(picks, wins, nil)
		logrus.WithFields(logrus.Fields{
			"R": R,
			"N": len(picks),
		}).Info("Aggregated pick% / win% correlation")
	}

	// Do another correlation, this time on bucketed data. The X axis is dates,
	// and the plots are of pick percentage and win percentage for each color.
	if resp.Buckets != nil && len(resp.Buckets) > 1 {
		for _, color := range colors {
			picks = []float64{}
			wins = []float64{}
			for _, b := range resp.Buckets {
				if c, ok := b.Data[color]; ok {
					picks = append(picks, c.TotalPickPercentage)
					wins = append(wins, c.WinPercent)
				} else {
					picks = append(picks, 0)
					wins = append(wins, 0)
				}
			}
			R := stat.Correlation(picks, wins, nil)
			logrus.WithFields(logrus.Fields{
				"R":     R,
				"N":     len(picks),
				"color": color,
			}).Info("Per-color pick / win correlation over time")
		}
	}
}

// statsForDecks computes color-bucketed deck stats. The same logic also lives
// client-side in GetColorStats (ui/src/pages/Colors.js) for per-player
// breakdowns and live re-filtering, so keep them in sync.
func (d *colorStatsHandler) statsForDecks(decks []*storage.Deck, statsReq *ColorStatsRequest) *Colors {
	resp := &Colors{
		Data: make(map[string]*colorStats),
	}

	// Decks with no decklist and no recorded colors have unknown colors, not
	// colorless ones. Leave them out entirely, including from Build %.
	decks = decksWithKnownColors(decks)

	// totalCards is inflated the same way per-color counts are: in inclusive
	// mode a WU deck contributes its cards to W, U, and WU buckets, so
	// TotalPickPercentage sums to 100% across all rows.
	totalCards := 0

	// totalWins counts each decisive game once. PercentOfWins divides by it,
	// so only exact mode sums to 100%: inclusive counts a deck in several rows,
	// and primary drops decks without a primary pair.
	totalWins := 0
	for _, deck := range decks {
		var colors []types.ColorIdentity
		var strict bool
		switch statsReq.ColorMode {
		case ColorModeInclusive:
			colors = deck.GetColors().Subsets()
		case ColorModeExact:
			strict = true
			colors = []types.ColorIdentity{deck.GetColors()}
		case ColorModePrimary:
			// If the deck has more than 2 colors, check if it has a primary color pair.
			pair := deck.PrimaryColorPair()
			if pair != nil {
				colors = []types.ColorIdentity{pair}
			}
		default:
			logrus.WithField("color_mode", statsReq.ColorMode).Warn("invalid color mode")
			return nil
		}

		totalWins += deck.GameWins()

		// Add this deck's stats to each matching color identity.
		for _, colorID := range colors {
			// If strict mode is enabled, then only include color identities that
			// strictly match the deck's identity.
			if strict && !deck.GetColors().Equals(colorID) {
				continue
			}

			// Convert the color identity to a string for use as a key in the response map.
			color := colorID.String()

			// Add this deck's stats to the color identity's aggregate stats.
			if _, ok := resp.Data[color]; !ok {
				resp.Data[color] = newColorStats(color)
			}
			resp.Data[color].Add(deck)
			resp.Data[color].Trophies += deck.Trophies()
			resp.Data[color].LastPlace += deck.LastPlace()
			resp.Data[color].Top50 += deck.TopHalf()
			resp.Data[color].Bottom50 += deck.BottomHalf()

			resp.Data[color].NumDecks += 1
		}

		// Count the deck's non-basic cards, to measure each color's share of the deck and tell primary colors from splashes.
		totalCardsInDeck := 0
		for _, card := range deck.Mainboard {
			// Skip basic lands, since they just dilute the percentages.
			if card.IsBasicLand() {
				continue
			}
			totalCardsInDeck++
		}

		// Count the colored mana symbols in the deck (its true devotion), so we can
		// measure how much a deck leans on each color by mana cost rather than card count.
		numPipsByColor := map[string]int{}
		totalPips := 0
		for _, card := range deck.Mainboard {
			if card.IsLand() {
				continue
			}
			for color, n := range card.ColorPips() {
				numPipsByColor[color] += n
				totalPips += n
			}
		}

		// Count the deck's cards matching each color in its identity.
		// TODO: CASEY: this excludes colorless cards, so color percentages don't add up to 100%.
		numCardsByColorInDeck := make(map[string]int)
		for _, deckColor := range colors {
			for _, card := range deck.Mainboard {
				// Skip basic lands, since they just dilute the percentages.
				if card.IsBasicLand() {
					continue
				}
				for _, cardColor := range card.Colors {
					if !deckColor.Contains(cardColor) {
						continue
					}
					numCardsByColorInDeck[deckColor.String()]++

					// Once we count a card as counting towards this part of the deck's identity,
					// we don't need to count the same card twice (e.g., if it is multi-color and matches
					// the deck twice).
					break
				}
			}
		}

		for color, num := range numCardsByColorInDeck {
			// Track this color's devotion in the deck: the share of colored mana symbols
			// that belong to it, summed over the letters of its identity (e.g. "WU" -> W + U pips).
			if totalPips > 0 {
				colorPips := 0
				for _, c := range color {
					colorPips += numPipsByColor[string(c)]
				}
				resp.Data[color].DeckPercentages = append(resp.Data[color].DeckPercentages, float64(colorPips)/float64(totalPips))
			}

			resp.Data[color].Cards += num
			totalCards += num
		}
	}

	// Summarize resp.Data stats and calculate percentages.
	zScore := zForConfidence(statsReq.Confidence)
	for _, color := range resp.Data {
		// Average devotion: the share of a deck's mana pips in this color, over decks with this identity. Lower means a splash, higher a primary color.
		densitySum := 0.0
		for _, a := range color.DeckPercentages {
			densitySum += a
		}
		densityCount := float64(len(color.DeckPercentages))

		color.AverageDeckPercentage = pct(densitySum, densityCount)
		color.BuildPercent = pct(float64(color.NumDecks), float64(len(decks)))
		color.TotalPickPercentage = pct(float64(color.Cards), float64(totalCards))
		color.Finalize()
		color.SetBayesian(bayesPriorGames(statsReq.ColorMode))
		color.SetInterval(zScore)
		logrus.WithFields(logrus.Fields{
			"color":       color.Color,
			"wins":        color.Wins,
			"losses":      color.Losses,
			"win_percent": color.WinPercent,
		}).Debug("Color win percentage")
		color.PercentOfWins = pct(float64(color.Wins), float64(totalWins))
	}

	return resp
}

// Colors is the per-color statistics keyed by color identity string.
type Colors struct {
	Data map[string]*colorStats `json:"data"`
}

func newColorStats(color string) *colorStats {
	return &colorStats{
		Color:           color,
		DeckPercentages: []float64{},
	}
}

// colorStats holds statistics about a specific color identity.
type colorStats struct {
	Record
	Color string `json:"color"`

	// Number of cards of this color.
	Cards int `json:"cards"`

	// Percent of all wins that included this color.
	PercentOfWins float64 `json:"percent_of_wins"`

	// Number of 3-0 decks.
	Trophies int `json:"trophies"`

	// Number of 0-3 decks.
	LastPlace int `json:"last_place"`
	Top50     int `json:"top_half"`
	Bottom50  int `json:"bottom_half"`

	// Each element is the percent of cards in a deck with this color.
	DeckPercentages []float64 `json:"deck_percentages"`

	// Average percent of non-land cards in a deck that are this color.
	AverageDeckPercentage float64 `json:"average_deck_percentage"`

	// Percent of all drafted cards that are this color.
	TotalPickPercentage float64 `json:"total_pick_percentage"`

	// Percent of all decks that have included this color.
	BuildPercent float64 `json:"build_percent"`

	// Total number of decks that included this color.
	NumDecks int `json:"num_decks"`
}

// decksWithKnownColors returns the decks that have at least one color, either
// recorded on the deck or inferred from its mainboard. A deck with neither has
// no decklist to go on, so it can't be placed in any color row.
func decksWithKnownColors(decks []*storage.Deck) []*storage.Deck {
	var known []*storage.Deck
	for _, d := range decks {
		if len(d.GetColors()) > 0 {
			known = append(known, d)
		}
	}
	return known
}
