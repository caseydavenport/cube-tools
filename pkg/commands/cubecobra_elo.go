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

// fetchCubeCobraCards returns per-card Cube Cobra data keyed by name, from the
// public cube export at /cube/api/cubeJSON/<cubeID>. cubeID may be a shortId or
// UUID. The endpoint is public, so no auth is needed.
func fetchCubeCobraCards(baseURL, cubeID string) (map[string]ccCardInfo, error) {
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

	cards := make(map[string]ccCardInfo)
	add := func(list []ccCubeCard) {
		for _, c := range list {
			if c.Details.Name == "" {
				continue
			}
			cards[c.Details.Name] = ccCardInfo{
				elo:   int(math.Round(c.Details.Elo)),
				image: c.Details.ImageNormal,
				url:   c.Details.ScryfallURI,
			}
		}
	}
	// Mainboard last so a card present in both boards keeps its mainboard data.
	add(cube.Cards.Maybeboard)
	add(cube.Cards.Mainboard)
	return cards, nil
}
