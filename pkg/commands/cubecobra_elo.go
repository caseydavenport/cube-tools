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
	Cards ccBoards `json:"cards"`
}

// ccBoards is the card lists of a Cube Cobra cube export.
type ccBoards struct {
	Mainboard  []ccCubeCard `json:"mainboard"`
	Maybeboard []ccCubeCard `json:"maybeboard"`
}

// ccCubeCard is one card of a Cube Cobra cube export.
type ccCubeCard struct {
	Details ccHydratedCard `json:"details"`

	// Tags are the cube owner's per-card tags. They live on the cube card
	// object itself, not inside details.
	Tags []string `json:"tags"`
}

// ccHydratedCard is the card, filled in from Cube Cobra's card database, that
// a cube export carries under each cube card's details.
type ccHydratedCard struct {
	Name        string  `json:"name"`
	Elo         float64 `json:"elo"`
	ImageNormal string  `json:"image_normal"`
	ScryfallURI string  `json:"scryfall_uri"`
}

// ccCardEnrichment is the per-card data we pull from the Cube Cobra export: the
// global draft Elo, the exact printing (image and Scryfall page) the cube runs,
// and the owner's per-card tags.
type ccCardEnrichment struct {
	elo   int
	image string
	url   string
	tags  []string
}

// fetchMaybeboard returns the card names on a CubeCobra cube's maybeboard, in
// CubeCobra's order, skipping entries with no name. It gives up after
// maybeboardClient's timeout.
func fetchMaybeboard(baseURL, cubeID string) ([]string, error) {
	cube, err := fetchCubeCobra(maybeboardClient, baseURL, cubeID)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, c := range cube.Cards.Maybeboard {
		if c.Details.Name != "" {
			names = append(names, c.Details.Name)
		}
	}
	return names, nil
}

// fetchCubeCobra fetches and decodes the public cube export at
// /cube/api/cubeJSON/<cubeID> with client. cubeID may be a shortId or UUID.
// The endpoint is public, so no auth is needed.
func fetchCubeCobra(client *http.Client, baseURL, cubeID string) (*ccCubeJSON, error) {
	resp, err := client.Get(fmt.Sprintf("%s/cube/api/cubeJSON/%s", baseURL, cubeID))
	if err != nil {
		return nil, fmt.Errorf("fetch cube JSON: %w", err)
	}
	defer logClose(resp.Body, "Cube Cobra response body")
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch cube JSON: status %d", resp.StatusCode)
	}

	var cube ccCubeJSON
	if err := json.NewDecoder(resp.Body).Decode(&cube); err != nil {
		return nil, fmt.Errorf("decode cube JSON: %w", err)
	}
	return &cube, nil
}

// enrichments returns per-card data keyed by name across both boards. A card on
// both boards takes its mainboard data.
func (c *ccCubeJSON) enrichments() map[string]ccCardEnrichment {
	cards := make(map[string]ccCardEnrichment)
	add := func(list []ccCubeCard) {
		for _, card := range list {
			if card.Details.Name == "" {
				continue
			}

			// A name can recur (fetches, shocks) with tags on only some
			// copies, so union the tags rather than let a tagless copy win.
			existing := cards[card.Details.Name]
			cards[card.Details.Name] = ccCardEnrichment{
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
func unionTags(first, second []string) []string {
	seen := make(map[string]bool, len(first)+len(second))
	out := make([]string, 0, len(first)+len(second))
	for _, t := range append(append([]string{}, first...), second...) {
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
