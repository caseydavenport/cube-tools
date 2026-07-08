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

	// Tags are the cube owner's per-card tags. They live on the cube card
	// object itself, not inside details.
	Tags []string `json:"tags"`
}

// ccCardInfo is the per-card data we pull from the Cube Cobra export: the global
// draft Elo, the exact printing (image and Scryfall page) the cube runs, and the
// owner's per-card tags.
type ccCardInfo struct {
	elo   int
	image string
	url   string
	tags  []string
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
			// Some cards run multiple copies (fetches, shocks) and Cube Cobra
			// tags each copy independently, so a name can recur with tags on
			// only some copies. Union the tags across every copy - a card is
			// tagged if any of its copies is - rather than letting a tagless
			// duplicate clobber a tagged one.
			existing := cards[card.Details.Name]
			cards[card.Details.Name] = ccCardInfo{
				elo:   int(math.Round(card.Details.Elo)),
				image: card.Details.ImageNormal,
				url:   card.Details.ScryfallURI,
				tags:  unionTags(existing.tags, card.Tags),
			}
		}
	}
	// Mainboard last so a card present in both boards keeps its mainboard data.
	add(c.Cards.Maybeboard)
	add(c.Cards.Mainboard)
	return cards
}

// unionTags merges two tag lists, preserving first-seen order and dropping
// duplicates and blanks.
func unionTags(a, b []string) []string {
	seen := make(map[string]bool, len(a)+len(b))
	out := make([]string, 0, len(a)+len(b))
	for _, t := range append(append([]string{}, a...), b...) {
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
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
