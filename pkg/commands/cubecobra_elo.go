package commands

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
)

// ccCubeJSON is the slice of Cube Cobra's public cube export we care about: each
// board's cards, each carrying a hydrated `details` object with the card's name
// and global draft Elo.
type ccCubeJSON struct {
	Cards struct {
		Mainboard  []ccCubeCard `json:"mainboard"`
		Maybeboard []ccCubeCard `json:"maybeboard"`
	} `json:"cards"`
}

type ccCubeCard struct {
	Details struct {
		Name string  `json:"name"`
		Elo  float64 `json:"elo"`
	} `json:"details"`
}

// fetchCubeCobraELO returns each card's Cube Cobra draft Elo keyed by name, from
// the public cube export at /cube/api/cubeJSON/<cubeID>. cubeID may be a shortId
// or UUID. The endpoint is public, so no auth is needed.
func fetchCubeCobraELO(baseURL, cubeID string) (map[string]int, error) {
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

	elo := make(map[string]int)
	add := func(cards []ccCubeCard) {
		for _, c := range cards {
			if c.Details.Name == "" {
				continue
			}
			elo[c.Details.Name] = int(math.Round(c.Details.Elo))
		}
	}
	// Mainboard last so a card present in both boards keeps its mainboard Elo.
	add(cube.Cards.Maybeboard)
	add(cube.Cards.Mainboard)
	return elo, nil
}
