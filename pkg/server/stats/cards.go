package stats

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

type CardStatsRequest struct {
	// Embed deck request to allow filtering by player, date range, and draft size.
	*storage.DecksRequest

	// Configuration for bucketed responses.
	BucketSize int  `json:"bucket_size"`
	Sliding    bool `json:"sliding"`

	// Color to filter by - WUBRG.
	Color string `json:"color"`
	// Minimum nubmer of drafts a card must have been in to be included.
	MinDrafts int `json:"min_drafts"`
	// Minimum number of games a card must have been in to be included.
	MinGames int `json:"min_games"`
}

type CardStatsResponse struct {
	// Aggregated stats for each card across all decks matching the request.
	All *Cards `json:"all"`

	// If bucketed response, then bucketed response data corresponding to the request.
	Buckets []*Bucket `json:"buckets,omitempty"`
}

type Bucket struct {
	// Inline the cards data.
	Cards `json:",inline"`

	// Include metadata about the bucket.
	Name string `json:"name"`

	// Total number of games in this bucket.
	Games int `json:"games,omitempty"`
}

func parseCardsRequest(r *http.Request) *CardStatsRequest {
	// Pull deck params from the request.
	p := CardStatsRequest{}
	p.Color = query.GetString(r, "color")
	p.BucketSize = query.GetInt(r, "bucket_size")
	p.Sliding = query.GetBool(r, "sliding")
	p.MinDrafts = query.GetInt(r, "min_drafts")
	p.MinGames = query.GetInt(r, "min_games")

	// Parse the embedded deck request.
	p.DecksRequest = decks.ParseDecksRequest(r)
	return &p
}

func CardStatsHandler() http.Handler {
	return &cardStatsHandler{
		store: storage.NewFileDeckStoreWithCache(),
	}
}

type cardStatsHandler struct {
	store storage.DeckStorage
}

func (d *cardStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	sr := parseCardsRequest(r)
	logrus.WithField("params", sr).Info("/api/stats/cards")

	resp := CardStatsResponse{}

	// Build a map of all the cards in the cube, so we can use it to skip any cards
	// not curerently in the cube.
	cubeCards := make(map[string]types.Card)
	cube, err := types.LoadCube("data/polyverse/cube.json")
	if err != nil {
		http.Error(rw, "could not load cube", http.StatusInternalServerError)
		return
	}
	for _, c := range cube.Cards {
		cubeCards[c.Name] = c
	}

	// Load allDecks matching the request.
	allDecks, err := d.store.List(sr.DecksRequest)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Initlialize the response structure.
	resp = CardStatsResponse{}
	if sr.BucketSize > 0 {
		// If bucket size is set, then create bucketed response.
		buckets := decks.DeckBuckets(allDecks, sr.BucketSize, !sr.Sliding)
		for _, b := range buckets {
			s := d.statsForDecks(b.AllDecks(), cubeCards, sr)
			resp.Buckets = append(resp.Buckets, &Bucket{
				Cards: *s,
				Name:  b.Name(),
				Games: b.TotalGames(),
			})
		}
	} else {
		resp.All = d.statsForDecks(allDecks, cubeCards, sr)
	}

	// Marshal the response and write it back.
	b, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	_, err = rw.Write(b)
	if err != nil {
		logrus.WithError(err).Error("could not write response")
		return
	}
}

func (d *cardStatsHandler) statsForDecks(decks []*storage.Deck, cubeCards map[string]types.Card, sr *CardStatsRequest) *Cards {
	resp := &Cards{
		Data: make(map[string]*cardStats),
	}

	// Sum up the total number of wins across all decks - we'll use this to calculate
	// PercentOfWins for each card later.
	var totalWins int

	// Go through each deck, adding stats for each card in the deck.
	for _, deck := range decks {
		// Increment the total wins counter.
		totalWins += deck.GameWins()

		// Get the set of unique cards in this deck's mainboard.
		mbSet, sbSet := cardSetFromDeck(deck.Deck, cubeCards, sr.Color)

		for _, card := range mbSet {
			// Initalize a new cardStats if we haven't seen this card before.
			if _, ok := resp.Data[card.Name]; !ok {
				cp := *card
				resp.Data[card.Name] = &cp
			}

			// Get the global cardStats for this card.
			cbn := resp.Data[card.Name]

			// Increment basic stats for this card.
			cbn.Mainboard++
			cbn.Wins += deck.GameWins()
			cbn.Losses += deck.GameLosses()
			cbn.Trophies += deck.Trophies()
			cbn.LastPlace += deck.LastPlace()

			if card.Appearances > 0 {
				cbn.Appearances += card.Appearances
			}

			// Update the last date that this card was put in a mainboard.
			deckDate, err := time.Parse("2006-01-02", deck.Date)
			if err != nil {
				logrus.WithError(err).WithField("date", deck.Date).Warn("could not parse deck date")
				continue
			}
			if cbn.LastMainboarded == "" {
				// First time seeing this card, so set last mainboarded to the deck date.
				cbn.LastMainboarded = deck.Date
			}
			lastDate, err := time.Parse("2006-01-02", cbn.LastMainboarded)
			if err != nil {
				logrus.WithError(err).WithField("date", cbn.LastMainboarded).Warn("could not parse last mainboarded date")
			}
			if deckDate.After(lastDate) {
				cbn.LastMainboarded = deck.Date
			}

			// Increment player count.
			cbn.Players[deck.Player]++

			// Include archetype data for this card
			for _, l := range deck.Labels {
				cbn.Archetypes[l]++
			}
		}

		for _, card := range sbSet {
			// Initalize a new cardStats if we haven't seen this card before.
			if _, ok := resp.Data[card.Name]; !ok {
				cp := *card
				resp.Data[card.Name] = &cp
			}

			// Get the global cardStats for this card.
			cbn := resp.Data[card.Name]

			// Increment basic stats for this card.
			cbn.Sideboard++

			// If the card is in the deck color(s), increment PlayableSideboard.
			if deck.CanCast(cubeCards[card.Name]) {
				cbn.PlayableSideboard++
			}

			// Increment player count.
			cbn.Sideboarders[deck.Player]++
		}
	}

	// Get ELO data to include in the response.
	eloData := ELOData(decks)

	// Now that we've gone through all the decks, calculate win percentages and mainboard/sideboard percentages,
	// and perform any filtering based on the request parameters.
	for _, cbn := range resp.Data {
		if shouldFilterCard(cbn, sr) {
			delete(resp.Data, cbn.Name)
			continue
		}

		// Add ELO data.
		if elo, ok := eloData[cbn.Name]; ok {
			cbn.ELO = elo
		} else {
			cbn.ELO = 1200
		}

		// Calculate win percentage and mainboard/sideboard percentages.
		cbn.TotalGames = cbn.Wins + cbn.Losses
		if cbn.TotalGames > 0 {
			cbn.WinPercent = math.Round(100 * float64(cbn.Wins) / float64(cbn.TotalGames))
		}
		if totalWins > 0 {
			cbn.PercentOfWins = math.Round(100 * float64(cbn.Wins) / float64(totalWins))
		}

		decksWithCard := cbn.Mainboard + cbn.Sideboard
		if decksWithCard > 0 {
			cbn.MainboardPercent = math.Round(100 * float64(cbn.Mainboard) / float64(decksWithCard))
			cbn.SideboardPercent = math.Round(100 * float64(cbn.Sideboard) / float64(decksWithCard))
		}
	}

	return resp
}

func ELOData(decks []*storage.Deck) map[string]int {
	type elo struct {
		elo  float64
		diff float64
	}

	// Store ELO data for each card by name.
	cards := make(map[string]*elo)

	// Populate initial ELO data.
	for _, d := range decks {
		for _, card := range d.Mainboard {
			if _, ok := cards[card.Name]; !ok {
				cards[card.Name] = &elo{elo: 1200, diff: 0}
			}
		}
		for _, card := range d.Sideboard {
			if _, ok := cards[card.Name]; !ok {
				cards[card.Name] = &elo{elo: 1200, diff: 0}
			}
		}
	}

	// Go through each deck and perform ELO calculations on the cards.
	for _, deck := range decks {
		for _, c1 := range deck.Mainboard {
			if c1.IsBasicLand() {
				continue
			}
			for _, c2 := range deck.Sideboard {
				if c2.IsBasicLand() {
					continue
				}
				if !deck.CanCast(c2) {
					continue
				}

				// How much the mainboard card "wins" against the sideboard card depends on a few factors.
				// Start with 1.0, and subtract based on differences in CMC, color, and type. The idea is that
				// the closer two cards are two each other in these dimensions, the more directly they are competing against each other.
				winValue := 1.0
				if c1.CMC != c2.CMC {
					winValue = winValue - 0.025*math.Abs(float64(c1.CMC-c2.CMC))
				}

				colorMatch := true
				if c1.Colors != nil && c2.Colors != nil {
					for _, color := range c1.Colors {
						for _, color2 := range c2.Colors {
							if !contains(c1.Colors, color2) || !contains(c2.Colors, color) {
								colorMatch = false
							}
						}
					}
				}
				if !colorMatch {
					winValue = winValue - 0.05
				}

				if (contains(c1.Types, "Creature") && !contains(c2.Types, "Creature")) ||
					(!contains(c1.Types, "Creature") && contains(c2.Types, "Creature")) {
					winValue = winValue - 0.1
				}

				if winValue < 0.55 {
					winValue = 0.55
				}

				cc1 := cards[c1.Name]
				cc2 := cards[c2.Name]

				r1 := math.Pow(10, cc1.elo/400)
				r2 := math.Pow(10, cc2.elo/400)

				e1 := r1 / (r1 + r2)
				e2 := r2 / (r1 + r2)

				s1 := winValue
				s2 := 1 - winValue

				k := 16.0
				cc1.diff += k * (s1 - e1)
				cc2.diff += k * (s2 - e2)
			}
		}

		// Update the cards actual ELO after each deck, and reset the diff for the next.
		for _, c1 := range deck.Mainboard {
			c := cards[c1.Name]
			c.elo += math.Round(c.diff)
			c.diff = 0
		}
		for _, c2 := range deck.Sideboard {
			c := cards[c2.Name]
			c.elo += math.Round(c.diff)
			c.diff = 0
		}
	}

	// Convert to map of card to ELo value.
	result := make(map[string]int)
	for name, c := range cards {
		result[name] = int(c.elo)
	}
	return result
}

// Helper: check if a slice contains a string
func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func shouldFilterCard(cbn *cardStats, sr *CardStatsRequest) bool {
	// For bucketed requests, we don't filter. The filteres in the request only apply to non-bucketed
	// aggregate requests.
	if sr.BucketSize > 0 {
		return false
	}

	// Filter based on min drafts and min games.
	if sr.MinDrafts > 0 && cbn.Mainboard+cbn.Sideboard < sr.MinDrafts {
		return true
	}
	if sr.MinGames > 0 && cbn.Wins+cbn.Losses < sr.MinGames {
		return true
	}
	return false
}

// Most cards are singleton in my cube. Except for fetches / shocks, for which it is
// very possible there are multiple in the same deck. Create a "set" of all the unique
// cards in the deck - this prevents double counting the wins contributed from a deck when there are
// two of a card in that deck. This is imperfect - there is some value in knowing that a deck with two Arid Mesas
// performed well - but I think without this deduplication we would overstate the importance of Arid Mesa in that deck
// more than we understate it now.
func cardSetFromDeck(deck types.Deck, cubeCards map[string]types.Card, color string) (map[string]*cardStats, map[string]*cardStats) {
	mbSet := make(map[string]*cardStats)
	sbSet := make(map[string]*cardStats)

	for _, card := range deck.Mainboard {
		// Skip the card if it's not currently in the cube, or if it's a basic land.
		if _, ok := cubeCards[card.Name]; !ok {
			continue
		}
		if card.IsBasicLand() {
			continue
		}
		if !card.IsColor(color) {
			continue
		}

		// Add to the card set.
		mbSet[card.Name] = newCardStats(card)
	}

	for _, card := range deck.Sideboard {
		// Skip the card if it's not currently in the cube, or if it's a basic land.
		if _, ok := cubeCards[card.Name]; !ok {
			continue
		}
		if card.IsBasicLand() {
			continue
		}
		if !card.IsColor(color) {
			continue
		}
		// Add to the card set.
		sbSet[card.Name] = newCardStats(card)
	}

	return mbSet, sbSet
}

type Cards struct {
	Data map[string]*cardStats `json:"data"`
}

func newCardStats(c types.Card) *cardStats {
	return &cardStats{
		Name:          c.Name,
		Archetypes:    make(map[string]int),
		Players:       make(map[string]int),
		Sideboarders:  make(map[string]int),
		URL:           c.URL,
		Land:          c.IsLand(),
		CMC:           c.CMC,
		Interaction:   c.IsInteraction(),
		Counterspell:  c.IsCounterspell(),
		Removal:       c.IsRemoval(),
		ColorIdentity: c.ColorIdentity,
	}
}

// cardStats holds statistics about a specific card.
type cardStats struct {
	// Name of the card
	Name string `json:"name"`
	// Number of times this card has been mainboarded
	Mainboard int `json:"mainboard"`
	// Number of times this card has been sideboarded
	Sideboard int `json:"sideboard"`
	// Total number of games this card has been in.
	TotalGames int `json:"total_games"`
	// Number of times this card was in deck color(s), and sideboarded
	PlayableSideboard int `json:"playable_sideboard"`
	// Number of wins (does not include sideboard)
	Wins int `json:"wins"`
	// Number of losses (does not include sideboard)
	Losses int `json:"losses"`
	// Number of 3-0 decks this card has been in
	Trophies int `json:"trophies"`
	// Number of 0-3 decks this card has been in
	LastPlace int `json:"last_place"`
	// Win percentage
	WinPercent float64 `json:"win_percent"`
	// Percent of all games won by decks with this card. This is different from WinPercent, which is
	// the percentage of games won given that this card was in the mainboard.
	PercentOfWins float64 `json:"percent_of_wins"`
	// Mainboard percentage
	MainboardPercent float64 `json:"mainboard_percent"`
	// Sideboard percentage
	SideboardPercent float64 `json:"sideboard_percent"`
	// Map of archetype to times played in that archetype
	Archetypes map[string]int `json:"archetypes"`
	// Who has played this card, and how often
	Players map[string]int `json:"players"`
	// Who has sideboarded this card, and how often
	Sideboarders map[string]int `json:"sideboarders"`
	// URL of the card
	URL string `json:"url"`
	// The last date that this card was mainboarded
	LastMainboarded string `json:"last_mainboarded"`
	// Number of times the card appears in a replay
	Appearances int `json:"appearances"`
	// Mana value
	CMC int `json:"cmc"`
	// Whether or not this card is classified as "interaction"
	Interaction bool `json:"interaction"`
	// Whether or not this is a counterspell
	Counterspell bool `json:"counterspell"`
	// Whether or not this is removal
	Removal bool `json:"removal"`
	// Whether or not this is a land
	Land bool `json:"land"`
	// ELO.
	ELO int `json:"elo"`
	// ColorIdentity of the card (e.g. ["W", "U"]
	ColorIdentity []string `json:"color_identity,omitempty"`
}
