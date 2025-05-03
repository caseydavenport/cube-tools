package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// Wrap the on-disk types.Deck with additional calculated fields.
type Deck struct {
	types.Deck `json:",inline"`

	// The size of the draft, used for filtering.
	draftSize int
}

type DecksRequest struct {
	Player    string `json:"player,omitempty"`
	Start     string `json:"start,omitempty"`
	End       string `json:"end,omitempty"`
	DraftSize int    `json:"size,omitempty"`
}

type DeckStorage interface {
	List(*DecksRequest) ([]Deck, error)
}

func NewFileDeckStore() DeckStorage {
	return &deckStore{}
}

type deckStore struct {
	cached []Deck
}

func (s *deckStore) List(req *DecksRequest) ([]Deck, error) {
	if s.cached == nil {
		var err error
		s.cached, err = loadDecks("polyverse")
		if err != nil {
			return nil, err
		}
	}
	return filter(s.cached, req), nil
}

func loadDecks(cube string) ([]Deck, error) {
	// Load index file.
	contents, err := os.ReadFile(fmt.Sprintf("data/%s/index.json", cube))
	if err != nil {
		return nil, err
	}
	var index commands.MainIndex
	if err := json.Unmarshal(contents, &index); err != nil {
		return nil, err
	}

	var decks []Deck
	for _, draft := range index.Drafts {
		for _, deck := range draft.Decks {
			d, err := loadDeck(deck.Path)
			if err != nil {
				logrus.WithError(err).Warn("Failed to load deck")
				continue
			}

			// Cache some additoinal metadata in the deck.
			d.draftSize = len(draft.Decks)
			decks = append(decks, d)
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

func filter(decks []Deck, r *DecksRequest) []Deck {
	// Check if we need to do any filtering.
	var empty DecksRequest
	if r == nil || *r == empty {
		return decks
	}

	filtered := []Deck{}
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
			if !dd.After(s) {
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

		if r.DraftSize != 0 && d.draftSize < r.DraftSize {
			continue
		}

		filtered = append(filtered, d)
	}
	return filtered
}
