package commands

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
)

// ccCubeJSON is the slice of Cube Cobra's public cube export we care about: each
// board's cards, each carrying a hydrated `details` object with the card's name,
// global draft Elo, and the printing the cube owner selected.
type ccCubeJSON struct {
	Cards struct {
		Mainboard  []ccCubeCard `json:"mainboard"`
		Maybeboard []ccCubeCard `json:"maybeboard"`
	} `json:"cards"`
}

type ccCubeCard struct {
	Details struct {
		Name        string  `json:"name"`
		Elo         float64 `json:"elo"`
		ImageNormal string  `json:"image_normal"`
		ScryfallURI string  `json:"scryfall_uri"`
	} `json:"details"`
}

// ccCardInfo is the per-card data we pull from the Cube Cobra export: the global
// draft Elo plus the exact printing (image and Scryfall page) the cube runs.
type ccCardInfo struct {
	elo   int
	image string
	url   string
}

// fetchCubeCobra fetches and decodes the public cube export at
// /cube/api/cubeJSON/<cubeID>. cubeID may be a shortId or UUID. The endpoint is
// public, so no auth is needed.
func fetchCubeCobra(baseURL, cubeID string) (*ccCubeJSON, error) {
	resp, err := http.Get(fmt.Sprintf("%s/cube/api/cubeJSON/%s", baseURL, cubeID))
	if err != nil {
		return nil, fmt.Errorf("fetch cube JSON: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch cube JSON: status %d", resp.StatusCode)
	}

	var cube ccCubeJSON
	if err := json.NewDecoder(resp.Body).Decode(&cube); err != nil {
		return nil, fmt.Errorf("decode cube JSON: %w", err)
	}
	return &cube, nil
}

// cardInfo returns per-card data keyed by name across both boards.
func (c *ccCubeJSON) cardInfo() map[string]ccCardInfo {
	cards := make(map[string]ccCardInfo)
	add := func(list []ccCubeCard) {
		for _, card := range list {
			if card.Details.Name == "" {
				continue
			}
			cards[card.Details.Name] = ccCardInfo{
				elo:   int(math.Round(card.Details.Elo)),
				image: card.Details.ImageNormal,
				url:   card.Details.ScryfallURI,
			}
		}
	}
	// Mainboard last so a card present in both boards keeps its mainboard data.
	add(c.Cards.Maybeboard)
	add(c.Cards.Mainboard)
	return cards
}

// mainboardNames returns the mainboard card names in list order, skipping blanks.
func (c *ccCubeJSON) mainboardNames() []string {
	names := make([]string, 0, len(c.Cards.Mainboard))
	for _, card := range c.Cards.Mainboard {
		if card.Details.Name == "" {
			continue
		}
		names = append(names, card.Details.Name)
	}
	return names
}

// fetchCubeCobraCards returns per-card Cube Cobra data keyed by name.
func fetchCubeCobraCards(baseURL, cubeID string) (map[string]ccCardInfo, error) {
	cube, err := fetchCubeCobra(baseURL, cubeID)
	if err != nil {
		return nil, err
	}
	return cube.cardInfo(), nil
}
