package cubecobra

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// fetchTTL is how long a fetched analysisdata response is reused before the
// next access re-fetches from CubeCobra. It sits under Store's own 10s cache.
const fetchTTL = 60 * time.Second

// Backend is a read-only deck source for a public CubeCobra cube, loaded on
// demand via the analysisdata endpoint. It implements DeckBackend only; it
// has no writers, so Store reports ErrUnsupported for notes, rules, deck
// metadata, and draft logs.
type Backend struct {
	baseURL string
	src     types.CubeSource

	mu     sync.Mutex
	cache  map[string]cached
	client *http.Client
}

type cached struct {
	resp    analysisResponse
	fetched time.Time
}

// New returns a CubeCobra-backed read-only backend. src overlays deck cards
// with the cube's live printings and tags (pass nil to fall back to oracle
// printings and no tags).
func New(baseURL string, src types.CubeSource) *Backend {
	return &Backend{
		baseURL: baseURL,
		src:     src,
		cache:   map[string]cached{},
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

// analysisResponse is the analysisdata payload. It reuses the round/match/player
// shapes from the export path but adds the per-player mainboard decks and the
// oracle-id card map, which the export structs don't carry.
type analysisResponse struct {
	Success string                  `json:"success"`
	Records []analysisRecord        `json:"records"`
	Cards   map[string]analysisCard `json:"cards"`
}

type analysisRecord struct {
	ID      string              `json:"id"`
	Name    string              `json:"name"`
	Date    int64               `json:"date"`
	Players []commands.CCPlayer `json:"players"`
	Matches []commands.CCRound  `json:"matches"`
	Trophy  []string            `json:"trophy"`
	Decks   map[string][]string `json:"decks"`
}

type analysisCard struct {
	Name string `json:"name"`
}

// fetch returns the cube's analysisdata, served from the TTL cache when fresh.
func (b *Backend) fetch(cube string) (analysisResponse, error) {
	ccid := cubes.CubeCobraID(cube)
	b.mu.Lock()
	defer b.mu.Unlock()
	if c, ok := b.cache[ccid]; ok && time.Since(c.fetched) < fetchTTL {
		return c.resp, nil
	}
	url := fmt.Sprintf("%s/cube/records/analysisdata/%s", b.baseURL, ccid)
	resp, err := b.client.Get(url)
	if err != nil {
		return analysisResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return analysisResponse{}, fmt.Errorf("cubecobra analysisdata %s: status %d", ccid, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return analysisResponse{}, err
	}
	var out analysisResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return analysisResponse{}, err
	}
	b.cache[ccid] = cached{resp: out, fetched: time.Now()}
	return out, nil
}

// RawDecks builds one deck per player per record from the cube's records. It
// does not enrich; Store does that.
func (b *Backend) RawDecks(cube string) ([]*storage.Deck, error) {
	data, err := b.fetch(cube)
	if err != nil {
		return nil, err
	}
	byName := b.cubeCardsByName(cube)

	var decks []*storage.Deck
	for _, rec := range data.Records {
		date := time.UnixMilli(rec.Date).UTC().Format("2006-01-02")
		for _, p := range rec.Players {
			d := &storage.Deck{}
			d.Player = p.Name
			d.ID = p.Name
			d.Date = date
			d.Metadata.DraftID = rec.ID
			d.DraftSize = len(rec.Players)
			d.Labels = []string{}
			d.Mainboard = buildMainboard(rec.Decks[p.Name], data.Cards, byName)
			d.Matches = matchesFor(p.Name, rec.Matches)
			decks = append(decks, d)
		}
	}
	return decks, nil
}

// cubeCardsByName indexes the cube's live card list (printing + tags) by name.
// Returns nil when there is no live cube to overlay.
func (b *Backend) cubeCardsByName(cube string) map[string]types.Card {
	if b.src == nil {
		return nil
	}
	c, err := b.src.Current(cube)
	if err != nil {
		return nil
	}
	out := make(map[string]types.Card, len(c.Cards))
	for _, card := range c.Cards {
		out[card.Name] = card
	}
	return out
}

// buildMainboard resolves each oracle id to a card, preferring the cube's live
// printing and tags and falling back to the oracle dataset for cards no longer
// in the cube.
func buildMainboard(oracleIDs []string, cards map[string]analysisCard, byName map[string]types.Card) []types.Card {
	out := make([]types.Card, 0, len(oracleIDs))
	for _, id := range oracleIDs {
		name := cards[id].Name
		if name == "" {
			continue
		}
		if card, ok := byName[name]; ok {
			out = append(out, card)
			continue
		}
		out = append(out, types.HydrateCard(name))
	}
	return out
}

// matchesFor extracts a player's matches across all rounds, flipping each
// result to the player's perspective.
func matchesFor(player string, rounds []commands.CCRound) []types.Match {
	var matches []types.Match
	for i, round := range rounds {
		for _, m := range round.Matches {
			if len(m.Results) < 3 {
				continue
			}
			w, l, draws := m.Results[0], m.Results[1], m.Results[2]
			switch player {
			case m.P1:
				matches = append(matches, types.Match{Opponent: m.P2, Round: i + 1, Wins: w, Losses: l, Draws: draws})
			case m.P2:
				matches = append(matches, types.Match{Opponent: m.P1, Round: i + 1, Wins: l, Losses: w, Draws: draws})
			}
		}
	}
	return matches
}
