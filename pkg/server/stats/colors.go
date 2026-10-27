package stats

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"gonum.org/v1/gonum/stat"
)

type colorMode string

const (
	// ColorModeInclusive counts a deck as contributing to all of its sub-identities (e.g., a WU deck counts as W, U, and WU).
	ColorModeInclusive colorMode = "inclusive"

	// ColorModeExact counts a deck only for its exact color identity (e.g., a WU deck counts only as WU).
	ColorModeExact colorMode = "exact"

	// ColorModePrimary counts a deck only for its exact color identity, but 3+ color decks with a clear
	// primary pair count as that pair (e.g., a WUB deck with a primary pair of WU counts as WU).
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

type ColorStatsResponse struct {
	// Aggregated stats for each card across all decks matching the request.
	All *Colors `json:"all"`

	// If bucketed response, then bucketed response data corresponding to the request.
	Buckets []*ColorBucket `json:"buckets,omitempty"`
}

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

func ColorStatsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &colorStatsHandler{q: newQuery(store, src)}
}

type colorStatsHandler struct {
	q *deckquery.Query
}

func (d *colorStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	sr := parseColorsRequest(r)
	if err := validateColorsRequest(*sr); err != nil {
		logrus.WithError(err).WithField("params", sr).Warn("invalid request")
		http.Error(rw, err.Error(), http.StatusBadRequest)
		return
	}

	logrus.WithField("params", sr).Info("/api/stats/cards")

	cubeID := server.CubeFromRequest(r)
	cubeCards := make(map[string]types.Card)
	cube, err := d.q.Cube(cubeID)
	if err == nil {
		for _, c := range cube.Cards {
			cubeCards[c.Name] = c
		}
	}

	resp := ColorStatsResponse{}

	// Load allDecks matching the request.
	allDecks, err := d.q.Decks(cubeID, sr.DecksRequest)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Initlialize the response structure.
	resp = ColorStatsResponse{}
	if sr.BucketSize > 0 {
		// If bucket size is set, then create bucketed response.
		buckets := decks.DeckBuckets(allDecks, sr.BucketSize, !sr.Sliding)
		logrus.WithFields(logrus.Fields{
			"num_buckets": len(buckets),
			"num_decks":   len(allDecks),
		}).Info("Created buckets for response")
		for _, b := range buckets {
			s := d.statsForDecks(b.AllDecks(), sr, cubeCards)
			resp.Buckets = append(resp.Buckets, &ColorBucket{
				Colors: *s,
				Name:   b.Name(),
				Start:  b.Start(),
				Games:  b.TotalGames(),
			})
		}
	} else {
		resp.All = d.statsForDecks(allDecks, sr, cubeCards)
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
	// Build an array of color pick percentages for each of WUBRG, and another for
	// color win percentages. We'll use this to generate a correlation coefficient to see
	// if there's a correlation between how often a color is drafted and how well it performs.
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

// statsForDecks computes color-bucketed deck stats. Same logic also lives
// client-side in GetColorStats (ui/src/pages/Colors.js) for per-player
// breakdowns and live re-filtering. Keep them in sync (see TODO on the JS
// side for collapsing the duplication).
func (d *colorStatsHandler) statsForDecks(decks []*storage.Deck, sr *ColorStatsRequest, cubeCards map[string]types.Card) *Colors {
	resp := &Colors{
		Data: make(map[string]*colorStats),
	}

	// Decks with no decklist and no recorded colors have unknown colors, not
	// colorless ones. Leave them out entirely, including from Build %.
	decks = decksWithKnownColors(decks)

	// totalCards is inflated the same way per-color counts are: in inclusive
	// mode a WU deck contributes its cards to W, U, and WU buckets, so
	// TotalPickPercentage sums to 100% across all rows. PercentOfWins is
	// normalized per identity length (see below) so each view — mono, dual,
	// tri — sums to 100% on its own.
	totalCards := 0
	for _, deck := range decks {
		var colors []types.ColorIdentity
		var strict bool
		switch sr.ColorMode {
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
			logrus.WithField("color_mode", sr.ColorMode).Warn("invalid color mode")
			return nil
		}

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

		// Compute per-deck average word count and attribute it to the deck's colors.
		deckWordCount := 0
		nonLandCount := 0
		for _, card := range deck.Mainboard {
			if !card.IsBasicLand() && !card.IsLand() {
				if cc, ok := cubeCards[card.Name]; ok {
					deckWordCount += cc.WordCount()
				} else {
					deckWordCount += card.WordCount()
				}
				nonLandCount++
			}
		}
		if nonLandCount > 0 {
			avgWC := float64(deckWordCount) / float64(nonLandCount)
			for _, colorID := range colors {
				color := colorID.String()
				if _, ok := resp.Data[color]; ok {
					resp.Data[color].wordCountSum += avgWC
					resp.Data[color].wordCountCount++
				}
			}
		}

		// Add metrics to the color based on card scope statistics.
		// Calculate the total number of cards drafted of the color across
		// all drafts, as well as the percentage of that color within the deck, which we'll
		// use to calculate an indicator of which colors are primary and which are splashed.
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
		deckPips := map[string]int{}
		totalPips := 0
		for _, card := range deck.Mainboard {
			if card.IsLand() {
				continue
			}
			for color, n := range card.ColorPips() {
				deckPips[color] += n
				totalPips += n
			}
		}

		// Go through each color in the deck's color identity, and increment
		// the count of cards within the deck that match that color identity.
		//
		// TODO: This calculation excludes colorless cards, meaning percentages for colors
		// will not add up to 100%.
		cardsPerColorInDeck := make(map[string]int)
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
					cardsPerColorInDeck[deckColor.String()]++

					// Once we count a card as counting towards this part of the deck's identity,
					// we don't need to count the same card twice (e.g., if it is multi-color and matches
					// the deck twice).
					break
				}
			}
		}

		for color, num := range cardsPerColorInDeck {
			// Track this color's devotion in the deck: the share of colored mana symbols
			// that belong to it, summed over the letters of its identity (e.g. "WU" -> W + U pips).
			if totalPips > 0 {
				colorPips := 0
				for _, c := range color {
					colorPips += deckPips[string(c)]
				}
				resp.Data[color].DeckPercentages = append(resp.Data[color].DeckPercentages, float64(colorPips)/float64(totalPips))
			}

			resp.Data[color].Cards += num
			totalCards += num
		}
	}

	// Normalize PercentOfWins within each identity length so the column sums
	// to 100% in mono, dual, and tri views independently.
	winsByLen := make(map[int]int)
	for _, color := range resp.Data {
		winsByLen[len(color.Color)] += color.Wins
	}

	// Summarize resp.Data stats and calculate percentages.
	z := zForConfidence(sr.Confidence)
	for _, color := range resp.Data {
		// First, calculate the average color devotion of each deck based on colored mana symbols.
		// This is a measure of, on average, what share of a deck's mana pips are a given color in
		// decks with that color identity. A lower percentage means a splash, a higher percentage
		// means it is a primary staple.
		densitySum := 0.0
		for _, a := range color.DeckPercentages {
			densitySum += a
		}
		densityCount := float64(len(color.DeckPercentages))

		color.AverageDeckPercentage = pct(densitySum, densityCount)
		color.BuildPercent = pct(float64(color.NumDecks), float64(len(decks)))
		color.TotalPickPercentage = pct(float64(color.Cards), float64(totalCards))
		color.Finalize()
		color.SetBayesian(bayesPriorGames(sr.ColorMode))
		color.SetInterval(z)
		logrus.WithFields(logrus.Fields{
			"color":       color.Color,
			"wins":        color.Wins,
			"losses":      color.Losses,
			"win_percent": color.WinPercent,
		}).Debug("Color win percentage")
		color.PercentOfWins = pct(float64(color.Wins), float64(winsByLen[len(color.Color)]))
		if color.wordCountCount > 0 {
			color.AvgWordCount = math.Round(color.wordCountSum/float64(color.wordCountCount)*100) / 100
		}
	}

	return resp
}

type Colors struct {
	Data map[string]*colorStats `json:"data"`
}

func newColorStats(color string) *colorStats {
	return &colorStats{
		Color:           color,
		DeckPercentages: []float64{},
	}
}

// colorStats holds statistics about a specific card.
type colorStats struct {
	Record
	Color                 string    `json:"color"`           // color
	Cards                 int       `json:"cards"`           // Number of cards of this color
	PercentOfWins         float64   `json:"percent_of_wins"` // % of all wins that included this color
	Trophies              int       `json:"trophies"`        // Number of 3-0 decks
	LastPlace             int       `json:"last_place"`      // Number of 0-3 decks
	Top50                 int       `json:"top_half"`
	Bottom50              int       `json:"bottom_half"`
	DeckPercentages       []float64 `json:"deck_percentages"`        // Each element: % of cards in a deck with this color
	AverageDeckPercentage float64   `json:"average_deck_percentage"` // Avg % of non-land cards in a deck that are this color
	TotalPickPercentage   float64   `json:"total_pick_percentage"`   // % of all drafted cards that are this color
	BuildPercent          float64   `json:"build_percent"`           // % of all decks that have included this color
	NumDecks              int       `json:"num_decks"`               // Total number of decks that included this color
	AvgWordCount          float64   `json:"avg_word_count"`          // Avg word count per card across decks with this color
	wordCountSum          float64
	wordCountCount        int
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
