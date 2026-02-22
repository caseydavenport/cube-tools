package storage

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// Wrap the on-disk types.Deck with additional calculated fields.
type Deck struct {
	types.Deck `json:",inline"`

	// Calculated stats based on the raw deck info. We calculate this server side
	// to avoid recalculating it in the UI.
	Stats Stats `json:"stats"`

	// The average win percentage of this deck's opponents, excluding games against this deck.
	OpponentWinPercentage float64 `json:"opponent_win_percentage"`

	// The size of the draft, used for filtering.
	DraftSize int `json:"draft_size"`
}

type Stats struct {
	MatchWins   int `json:"match_wins"`
	MatchLosses int `json:"match_losses"`
	MatchDraws  int `json:"match_draws"`
	GameWins    int `json:"game_wins"`
	GameLosses  int `json:"game_losses"`
	GameDraws   int `json:"game_draws"`
	Trophies    int `json:"trophies"`
	LastPlace   int `json:"last_place"`
}

// Key identifies a precise deck.
type key struct {
	player string
	draft  string
}

type DecksRequest struct {
	Player    string `json:"player,omitempty"`
	Start     string `json:"start,omitempty"`
	End       string `json:"end,omitempty"`
	DraftSize int    `json:"size,omitempty"`
	Match     string `json:"match,omitempty"`
}

func (d *Deck) GetPlayer() string   { return d.Player }
func (d *Deck) GetLabels() []string { return d.Labels }
func (d *Deck) GetDraftSize() int   { return d.DraftSize }
func (d *Deck) GetMainboard() []types.Card {
	res := make([]types.Card, len(d.Mainboard))
	for i, c := range d.Mainboard {
		res[i] = c
	}
	return res
}

func (d *Deck) GetSideboard() []types.Card {
	res := make([]types.Card, len(d.Sideboard))
	for i, c := range d.Sideboard {
		res[i] = c
	}
	return res
}

func (d *Deck) GetPool() []types.Card {
	res := make([]types.Card, len(d.Pool))
	for i, c := range d.Pool {
		res[i] = c
	}
	return res
}

func (d *Deck) GetColors() []string {
	colors := d.Deck.GetColors()
	var res []string
	for c := range colors {
		res = append(res, c)
	}
	return res
}

type DeckStorage interface {
	List(*DecksRequest) ([]*Deck, error)
}

func NewFileDeckStore() DeckStorage {
	d := &deckStore{}
	go d.maintainCache()
	return d
}

func NewFileDeckStoreWithCache() DeckStorage {
	return &deckStore{}
}

type deckStore struct {
	sync.Mutex
	cache  []*Deck
	lookup map[key]*Deck
}

// Maintain the cache in a separate goroutine.
func (s *deckStore) maintainCache() {
	for {
		// Clear the cache every 10 seconds, which will force a reload on the next request.
		<-time.After(10 * time.Second)
		s.Lock()
		s.cache = nil
		s.Unlock()
	}
}

func (s *deckStore) List(req *DecksRequest) ([]*Deck, error) {
	s.Lock()
	defer s.Unlock()

	if s.cache == nil {
		var err error
		s.cache, err = loadDecks("polyverse")
		if err != nil {
			return nil, err
		}

		// Update the lookup map.
		s.lookup = make(map[key]*Deck)
		for _, d := range s.cache {
			k := key{
				player: d.Player,
				draft:  d.Metadata.DraftID,
			}
			s.lookup[k] = d
		}

		// Perform any additional processing on the decks.
		process(s.lookup)
	}
	return filter(s.cache, req), nil
}

func loadDecks(cube string) ([]*Deck, error) {
	logrus.Info("Loading decks from disk")

	// Load index file.
	contents, err := os.ReadFile(fmt.Sprintf("data/%s/index.json", cube))
	if err != nil {
		return nil, err
	}
	var index commands.MainIndex
	if err := json.Unmarshal(contents, &index); err != nil {
		return nil, err
	}

	var decks []*Deck
	for _, draft := range index.Drafts {
		for _, deck := range draft.Decks {
			d, err := loadDeck(deck.Path)
			if err != nil {
				logrus.WithError(err).Warn("Failed to load deck")
				continue
			}

			// Cache some additoinal metadata in the deck.
			d.DraftSize = len(draft.Decks)
			decks = append(decks, &d)
		}
	}
	return decks, nil
}

func loadDeck(path string) (Deck, error) {
	var d Deck
	contents, err := os.ReadFile(path)
	if err != nil {
		return d, err
	}
	if err = json.Unmarshal(contents, &d); err != nil {
		return d, err
	}
	return d, nil
}

func process(decks map[key]*Deck) {
	// Calculate the opponent win percentage for each deck by iterating each Match.
	for k, d := range decks {
		// Track the total number of games and total number of wins played by opponents.
		percentages := []float64{}

		for _, m := range d.Matches {
			// Determine the opponent.
			opponent := key{
				player: m.Opponent,
				draft:  k.draft,
			}

			// Find the opponent's deck.
			opponentDeck, ok := decks[opponent]
			if !ok {
				logrus.WithField("opponent", opponent).Warn("failed to find opponent deck")
				continue
			}

			// Get the number of total games this opponent played, and how many this opponent
			// won, excluding games against us.
			games := 0
			wins := 0
			for _, g := range opponentDeck.Games {
				if g.Opponent != k.player {
					games++
					if g.Winner == m.Opponent {
						wins++
					}
				}
			}

			// Calculate this opponent's win percentage (excluding games against us).
			if games > 0 {
				percentages = append(percentages, float64(wins)/float64(games))
			}
		}

		// Calculate the average opponent win percentage.
		if len(percentages) > 0 {
			total := 0.0
			for _, p := range percentages {
				total += p
			}
			d.OpponentWinPercentage = math.Round(100 * total / float64(len(percentages)))
		} else {
			d.OpponentWinPercentage = 0.0
		}

		// Add status.
		d.Stats = Stats{
			MatchWins:   d.MatchWins(),
			MatchLosses: d.MatchLosses(),
			MatchDraws:  d.MatchDraws(),
			GameWins:    d.GameWins(),
			GameLosses:  d.GameLosses(),
			GameDraws:   d.GameDraws(),
			Trophies:    d.Trophies(),
			LastPlace:   d.LastPlace(),
		}
	}
}

func filter(decks []*Deck, r *DecksRequest) []*Deck {
	// Check if we need to do any filtering.
	var empty DecksRequest
	if r == nil || *r == empty {
		return decks
	}

	filtered := []*Deck{}
	for _, d := range decks {
		// Check player.
		if r.Player != "" && !strings.EqualFold(d.Player, r.Player) {
			continue
		}

		// Parse the deck's date.
		dd, err := time.Parse(time.DateOnly, d.Date)
		if err != nil {
			logrus.WithError(err).Warn("failed to parse deck date")
			continue
		}

		// Check start date.
		if r.Start != "" {
			s, err := time.Parse(time.DateOnly, r.Start)
			if err != nil {
				logrus.WithError(err).Warn("failed to parse start")
				continue
			}
			if dd.Before(s) {
				continue
			}
		}

		// Check end date.
		if r.End != "" {
			e, err := time.Parse(time.DateOnly, r.End)
			if err != nil {
				logrus.WithError(err).Warn("failed to parse end")
				continue
			}
			if dd.After(e) {
				continue
			}
		}

		if r.DraftSize != 0 && d.DraftSize < r.DraftSize {
			continue
		}

		// Check the query string.
		if r.Match != "" && !query.DeckMatches(d, r.Match) {
			continue
		}

		filtered = append(filtered, d)
	}
	return filtered
}
