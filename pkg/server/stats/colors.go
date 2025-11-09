package stats

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
	"gonum.org/v1/gonum/stat"
)

type ColorStatsRequest struct {
	// Embed deck request to allow filtering by player, date range, and draft size.
	*storage.DecksRequest

	// Configuration for bucketed responses.
	BucketSize   int  `json:"bucket_size"`
	Sliding      bool `json:"sliding"`
	StrictColors bool `json:"strict_colors"`
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

	// Total number of games in this bucket.
	Games int `json:"games,omitempty"`
}

func parseColorsRequest(r *http.Request) *ColorStatsRequest {
	// Pull deck params from the request.
	p := ColorStatsRequest{}
	p.BucketSize = query.GetInt(r, "bucket_size")
	p.Sliding = query.GetBool(r, "sliding")
	p.StrictColors = query.GetBool(r, "strict_colors")

	// Parse the embedded deck request.
	p.DecksRequest = decks.ParseDecksRequest(r)

	return &p
}

func ColorStatsHandler() http.Handler {
	return &colorStatsHandler{
		store: storage.NewFileDeckStoreWithCache(),
	}
}

type colorStatsHandler struct {
	store storage.DeckStorage
}

func (d *colorStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	sr := parseColorsRequest(r)
	logrus.WithField("params", sr).Info("/api/stats/cards")

	resp := ColorStatsResponse{}

	// Load allDecks matching the request.
	allDecks, err := d.store.List(sr.DecksRequest)
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
			s := d.statsForDecks(b.AllDecks(), sr)
			resp.Buckets = append(resp.Buckets, &ColorBucket{
				Colors: *s,
				Name:   b.Name(),
				Games:  b.TotalGames(),
			})
		}
	} else {
		resp.All = d.statsForDecks(allDecks, sr)
	}

	// Print out correlation coefficients between color pick percentages and win percentages.
	// d.printCorrelations(resp)

	// Marshal the response and write it back.
	b, err := json.MarshalIndent(resp, "", "  ")
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

func (d *colorStatsHandler) statsForDecks(decks []*storage.Deck, sr *ColorStatsRequest) *Colors {
	resp := &Colors{
		Data: make(map[string]*colorStats),
	}

	totalWins := 0
	totalCards := 0
	for _, deck := range decks {
		// Add this deck's wins to the total count of games.
		totalWins += deck.GameWins()

		// Start by adding metrics at the deck scope for color identity.
		// Add wins and losses contributed for each color / color combination within this deck.
		identities := deck.ColorIdentities()

		// If we're in strict mode, ignore any color that isn't strictly the color identity of
		// the deck. For example, a WG deck will only count as WG in strict mode, whereas it would
		// count as W, G, and WG normally.
		var colors []string
		for color := range identities {
			if sr.StrictColors && len(deck.GetColors()) != len(color) {
				// Skip this color since it isn't strictly the color identity of the deck.
				continue
			}
			colors = append(colors, color)
		}

		// Add this deck's stats to each matching color identity.
		for _, color := range colors {
			if _, ok := resp.Data[color]; !ok {
				resp.Data[color] = newColorStats(color)
			}
			resp.Data[color].Wins += deck.GameWins()
			resp.Data[color].Losses += deck.GameLosses()
			resp.Data[color].Trophies += deck.Trophies()
			resp.Data[color].LastPlace += deck.LastPlace()
			resp.Data[color].Top50 += deck.TopHalf()
			resp.Data[color].Bottom50 += deck.BottomHalf()

			resp.Data[color].NumDecks += 1
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
			totalCards++
			totalCardsInDeck++
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
					if !strings.Contains(deckColor, cardColor) {
						continue
					}
					cardsPerColorInDeck[deckColor]++

					// Once we count a card as counting towards this part of the deck's identity,
					// we don't need to count the same card twice (e.g., if it is multi-color and matches
					// the deck twice).
					break
				}
			}
		}

		for color, num := range cardsPerColorInDeck {
			// Track the percentage of cards in the deck that belong to this color.
			deckFrac := float64(num) / float64(totalCardsInDeck)
			resp.Data[color].DeckPercentages = append(resp.Data[color].DeckPercentages, deckFrac)

			// Calculate "victory points" - the number of wins attributed to this color by weighting
			// the deck's total number of wins by the percentage of cards that belong to this color.
			winFrac := deckFrac * float64(deck.GameWins())
			resp.Data[color].VictoryPointsPerDeck = append(resp.Data[color].VictoryPointsPerDeck, winFrac)

			// Calculate the total number of victory points that could have been achieved - i.e., if
			// all losses were instead wins.
			lossFrac := deckFrac * float64(deck.GameLosses())
			if winFrac+lossFrac > 0 {
				resp.Data[color].AvailableVictoryPoints += winFrac + lossFrac
			}
			resp.Data[color].Cards += num
		}
	}

	// Summarize resp.Data stats and calculate percentages.
	for _, color := range resp.Data {
		// First, calculate the average color devotion of each deck based on card count (not true devotion, as in mana cost).
		// This is a measure of, on average, how many cards of a given color appear in
		// decks with that color identity. A lower percentage means a splash, a higher percentage
		// means it is a primary staple.
		densitySum := 0.0
		for _, a := range color.DeckPercentages {
			densitySum += a
		}
		densityCount := float64(len(color.DeckPercentages))
		if densityCount > 0 {
			color.AverageDeckPercentage = math.Round(100 * densitySum / densityCount)
		}

		vpSum := 0.0
		for _, a := range color.VictoryPointsPerDeck {
			vpSum += a
		}
		color.VictoryPoints = math.Round(100*vpSum) / 100

		// Calculate the percentage of all cards drafted that are this color.
		color.BuildPercent = math.Round(float64(color.NumDecks) / float64(len(decks)) * 100)
		if totalCards != 0 {
			color.TotalPickPercentage = math.Round(100 * float64(color.Cards) / float64(totalCards))
		}
		if color.Wins+color.Losses != 0 {
			color.WinPercent = math.Round(100 * float64(color.Wins) / float64(color.Wins+color.Losses))
			logrus.WithFields(logrus.Fields{
				"color":       color.Color,
				"wins":        color.Wins,
				"losses":      color.Losses,
				"win_percent": color.WinPercent,
			}).Debug("Color win percentage")
		}
		if totalWins != 0 && color.Wins != 0 {
			color.PercentOfWins = math.Round(100 * float64(color.Wins) / float64(totalWins))
		}
	}

	return resp
}

type Colors struct {
	Data map[string]*colorStats `json:"data"`
}

func newColorStats(color string) *colorStats {
	return &colorStats{
		Color:                color,
		DeckPercentages:      []float64{},
		VictoryPointsPerDeck: []float64{},
	}
}

// colorStats holds statistics about a specific card.
type colorStats struct {
	Color                  string    `json:"color"`           // color
	Wins                   int       `json:"wins"`            // Number of game wins
	Losses                 int       `json:"losses"`          // Number of game losses
	Cards                  int       `json:"cards"`           // Number of cards of this color
	PercentOfWins          float64   `json:"percent_of_wins"` // % of all wins that included this color
	Trophies               int       `json:"trophies"`        // Number of 3-0 decks
	LastPlace              int       `json:"last_place"`      // Number of 0-3 decks
	Top50                  int       `json:"top_half"`
	Bottom50               int       `json:"bottom_half"`
	DeckPercentages        []float64 `json:"deck_percentages"`         // Each element: % of cards in a deck with this color
	AverageDeckPercentage  float64   `json:"average_deck_percentage"`  // Avg % of non-land cards in a deck that are this color
	TotalPickPercentage    float64   `json:"total_pick_percentage"`    // % of all drafted cards that are this color
	WinPercent             float64   `json:"win_percent"`              // Win % of decks including this color
	BuildPercent           float64   `json:"build_percent"`            // % of all decks that have included this color
	NumDecks               int       `json:"num_decks"`                // Total number of decks that included this color
	VictoryPoints          float64   `json:"victory_points"`           // Fractional wins attributed to this color
	AvailableVictoryPoints float64   `json:"available_victory_points"` // Victory points possible if won every game
	VictoryPointsPerDeck   []float64 `json:"victory_points_per_deck"`  // Each entry: contribution of a particular deck
}
