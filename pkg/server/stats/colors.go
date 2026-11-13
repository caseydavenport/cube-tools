package stats

import (
	"fmt"
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
	// DecksRequest filters the decks by player, date range, and draft size.
	*storage.DecksRequest

	// BucketSize and Sliding turn on bucketed responses.
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
	// Aggregated color stats across all decks matching the request.
	All *Colors `json:"all"`

	// If bucketed response, then bucketed response data corresponding to the request.
	Buckets []*ColorBucket `json:"buckets,omitempty"`
}

// ColorBucket is the color statistics for one time bucket of decks.
type ColorBucket struct {
	Colors `json:",inline"`

	// Name labels the bucket by the dates it spans.
	Name string `json:"name"`

	// Start is the bucket's starting date, used as the x-axis label.
	Start string `json:"start"`

	// Total number of games in this bucket.
	Games int `json:"games,omitempty"`
}

// parseColorsRequest reads the colors query parameters, defaulting the color
// mode to exact. It doesn't validate them.
func parseColorsRequest(r *http.Request) *ColorStatsRequest {
	p := ColorStatsRequest{}
	p.BucketSize = query.GetInt(r, "bucket_size")
	p.Sliding = query.GetBool(r, "sliding")
	p.ColorMode = colorMode(r.URL.Query().Get("color_mode"))
	if p.ColorMode == "" {
		p.ColorMode = ColorModeExact
	}
	p.Confidence = query.GetFloat(r, "confidence")
	p.DecksRequest = decks.ParseDecksRequest(r)
	return &p
}

// validateColorsRequest rejects an unknown color mode or a confidence outside
// 0 to 1.
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

	logrus.WithField("params", statsReq).Info("/api/stats/colors")

	allDecks, err := d.q.Decks(server.CubeFromRequest(r), statsReq.DecksRequest)
	if err != nil {
		logrus.WithError(err).Error("could not load decks for color stats")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	resp := ColorStatsResponse{}
	if statsReq.BucketSize > 0 {
		buckets := decks.DeckBuckets(allDecks, statsReq.BucketSize, !statsReq.Sliding)
		logrus.WithFields(logrus.Fields{
			"num_buckets": len(buckets),
			"num_decks":   len(allDecks),
		}).Info("Created buckets for response")
		for _, b := range buckets {
			resp.Buckets = append(resp.Buckets, &ColorBucket{
				Colors: *colorsForDecks(b.AllDecks(), statsReq.ColorMode, statsReq.Confidence),
				Name:   b.Name(),
				Start:  b.Start(),
				Games:  b.TotalGames(),
			})
		}
	} else {
		resp.All = colorsForDecks(allDecks, statsReq.ColorMode, statsReq.Confidence)
	}

	writeJSON(rw, resp, "colors")
}

// colorsForDecks computes color-bucketed deck stats. The same logic also lives
// client-side in GetColorStats (ui/src/pages/Colors.js) for per-player
// breakdowns and live re-filtering, so keep them in sync. A mode other than
// the three colorMode constants leaves every row empty.
func colorsForDecks(allDecks []*storage.Deck, mode colorMode, confidence float64) *Colors {
	colors := &Colors{Data: make(map[string]*colorStats)}

	// Decks with no decklist and no recorded colors have unknown colors, not
	// colorless ones. Leave them out entirely, including from Build %.
	knownDecks := decksWithKnownColors(allDecks)

	// totalCards is inflated the same way per-color counts are: in inclusive
	// mode a WU deck contributes its cards to W, U, and WU buckets, so
	// TotalPickPercentage sums to 100% across all rows.
	totalCards := 0

	// totalWins counts each decisive game once. PercentOfWins divides by it,
	// so only exact mode sums to 100%: inclusive counts a deck in several rows,
	// and primary drops decks without a primary pair.
	totalWins := 0
	for _, deck := range knownDecks {
		identities := identitiesFor(deck, mode)
		totalWins += deck.GameWins()

		for _, identity := range identities {
			row := colors.row(identity.String())
			row.Add(deck)
			row.Trophies += deck.Trophies()
			row.LastPlace += deck.LastPlace()
			row.Top50 += deck.TopHalf()
			row.Bottom50 += deck.BottomHalf()
			row.NumDecks++
		}

		// Devotion measures how much a deck leans on each color by mana
		// cost rather than card count.
		numPipsByColor, totalPips := countColorPips(deck)
		for color, num := range countCardsByIdentity(deck, identities) {
			row := colors.Data[color]
			if totalPips > 0 {
				// The share of colored mana symbols that belong to this
				// identity, summed over its letters (e.g. "WU" -> W + U pips).
				identityPips := 0
				for _, c := range color {
					identityPips += numPipsByColor[string(c)]
				}
				row.DeckPercentages = append(row.DeckPercentages, float64(identityPips)/float64(totalPips))
			}
			row.Cards += num
			totalCards += num
		}
	}

	zScore := zForConfidence(confidence)
	for _, row := range colors.Data {
		// Average devotion: the share of a deck's mana pips in this color, over decks with this identity. Lower means a splash, higher a primary color.
		devotionSum := 0.0
		for _, share := range row.DeckPercentages {
			devotionSum += share
		}

		row.AverageDeckPercentage = pct(devotionSum, float64(len(row.DeckPercentages)))
		row.BuildPercent = pct(float64(row.NumDecks), float64(len(knownDecks)))
		row.TotalPickPercentage = pct(float64(row.Cards), float64(totalCards))
		row.Finalize()
		row.SetBayesian(bayesPriorGames(mode))
		row.SetInterval(zScore)
		row.PercentOfWins = pct(float64(row.Wins), float64(totalWins))
		logrus.WithFields(logrus.Fields{
			"color":       row.Color,
			"wins":        row.Wins,
			"losses":      row.Losses,
			"win_percent": row.WinPercent,
		}).Debug("Color win percentage")
	}
	return colors
}

// identitiesFor lists the color identities a deck counts toward in the mode:
// all its sub-identities, only its own, or its primary pair when it has one.
func identitiesFor(deck *storage.Deck, mode colorMode) []types.ColorIdentity {
	switch mode {
	case ColorModeInclusive:
		return deck.GetColors().Subsets()
	case ColorModeExact:
		return []types.ColorIdentity{deck.GetColors()}
	case ColorModePrimary:
		if pair := deck.PrimaryColorPair(); pair != nil {
			return []types.ColorIdentity{pair}
		}
	default:
		logrus.WithField("color_mode", mode).Warn("invalid color mode")
	}
	return nil
}

// countColorPips counts the colored mana symbols in the deck's nonland cards,
// by color and in total.
func countColorPips(deck *storage.Deck) (map[string]int, int) {
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
	return numPipsByColor, totalPips
}

// countCardsByIdentity counts the deck's non-basic cards that share a color
// with each identity, keyed by the identity's string. A card counts once per
// identity however many of its colors match. Colorless cards match no
// identity, so color percentages don't add up to 100%.
func countCardsByIdentity(deck *storage.Deck, identities []types.ColorIdentity) map[string]int {
	numCardsByIdentity := make(map[string]int)
	for _, identity := range identities {
		for _, card := range deck.Mainboard {
			// Basic lands would only dilute the percentages.
			if card.IsBasicLand() {
				continue
			}
			if slices.ContainsFunc(card.Colors, identity.Contains) {
				numCardsByIdentity[identity.String()]++
			}
		}
	}
	return numCardsByIdentity
}

// Colors is the per-color statistics keyed by color identity string.
type Colors struct {
	Data map[string]*colorStats `json:"data"`
}

// row returns the statistics for a color identity string, adding an empty row
// the first time it's asked for.
func (c *Colors) row(color string) *colorStats {
	if _, ok := c.Data[color]; !ok {
		c.Data[color] = &colorStats{Color: color, DeckPercentages: []float64{}}
	}
	return c.Data[color]
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

	// Number of decks with more match wins than losses, and with more losses than wins.
	Top50    int `json:"top_half"`
	Bottom50 int `json:"bottom_half"`

	// Each element is one deck's share of colored mana symbols in this color, from 0 to 1.
	DeckPercentages []float64 `json:"deck_percentages"`

	// Average share, in percent, of a deck's colored mana symbols that are this color.
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
