package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

type StatsResponse struct {
	Cards *Cards `json:"cards"`
}

func StatusHandler() http.Handler {
	return &statsHandler{
		store: storage.NewFileDeckStore(),
	}
}

type statsHandler struct {
	store storage.DeckStorage
}

func (d *statsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	sr := parseStatsRequest(r)
	logrus.WithField("params", sr).Info("/api/stats")

	resp := StatsResponse{}

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

	// Load all decks.
	decks, err := d.store.List(&storage.DecksRequest{})
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Initlialize the response structure.
	resp = StatsResponse{}
	resp.Cards = &Cards{
		Data: make(map[string]*cardStats),
	}

	// Go through each deck, adding stats for each card in the deck.
	for _, deck := range decks {

		// Get the set of unique cards in this deck's mainboard.
		mbSet, sbSet := cardSetFromDeck(deck.Deck, cubeCards, sr.Color)

		for _, card := range mbSet {
			// Initalize a new cardStats if we haven't seen this card before.
			if _, ok := resp.Cards.Data[card.Name]; !ok {
				cp := *card
				resp.Cards.Data[card.Name] = &cp
			}

			// Get the global cardStats for this card.
			cbn := resp.Cards.Data[card.Name]

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
			lastDate, err := time.Parse("2006-01-02", cbn.LastMainboarded)
			if err != nil {
				// If we can't parse the last date, just set it to the deck date.
				cbn.LastMainboarded = deck.Date
				continue
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
			if _, ok := resp.Cards.Data[card.Name]; !ok {
				cp := *card
				resp.Cards.Data[card.Name] = &cp
			}

			// Get the global cardStats for this card.
			cbn := resp.Cards.Data[card.Name]

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

	// Now that we've gone through all the decks, calculate win percentages and mainboard/sideboard percentages,
	// and perform any filtering based on the request parameters.
	for _, cbn := range resp.Cards.Data {
		if shouldFilterCard(cbn, sr) {
			delete(resp.Cards.Data, cbn.Name)
			continue
		}

		// Calculate win percentage and mainboard/sideboard percentages.
		cbn.TotalGames = cbn.Wins + cbn.Losses
		if cbn.TotalGames > 0 {
			cbn.WinPercent = float64(cbn.Wins) / float64(cbn.TotalGames)
		}
		if len(decks) > 0 {
			cbn.MainboardPercent = float64(cbn.Mainboard) / float64(len(decks))
			cbn.SideboardPercent = float64(cbn.Sideboard) / float64(len(decks))
		}
	}

	// Marshal the response and write it back.
	b, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		panic(err)
	}
	_, err = rw.Write(b)
	if err != nil {
		panic(err)
	}
}

func shouldFilterCard(cbn *cardStats, sr *StatsRequest) bool {
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

func parseStatsRequest(r *http.Request) *StatsRequest {
	// Pull deck params from the request.
	p := StatsRequest{}
	p.Color = getString(r, "color")
	return &p
}

type StatsRequest struct {
	// Color to filter by - WUBRG.
	Color string `json:"color"`
	// Minimum nubmer of drafts a card must have been in to be included.
	MinDrafts int `json:"min_drafts"`
	// Minimum number of games a card must have been in to be included.
	MinGames int `json:"min_games"`
}

type Cards struct {
	Data map[string]*cardStats `json:"data"`
}

func newCardStats(c types.Card) *cardStats {
	return &cardStats{
		Name:         c.Name,
		Archetypes:   make(map[string]int),
		Players:      make(map[string]int),
		Sideboarders: make(map[string]int),
		URL:          c.URL,
		Land:         c.IsLand(),
		CMC:          c.CMC,
		Interaction:  c.IsInteraction(),
		Counterspell: c.IsCounterspell(),
		Removal:      c.IsRemoval(),
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
}
