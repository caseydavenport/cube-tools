package storage

import (
	"errors"
	"strings"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// Wrap the on-disk types.Deck with additional calculated fields.
type Deck struct {
	types.Deck `json:",inline"`

	// Games is a flattened list of all games in all matches.
	// We include this for compatibility with the UI.
	Games []types.Game `json:"games"`

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
	Board     string `json:"board,omitempty"`

	// CommunityEdges carries the cube design graph for a community: term in Match.
	// The handler sets it only when Match needs it; nil means no community filter.
	CommunityEdges []graph.Edge `json:"-"`
}

func (d *Deck) GetPlayer() string { return d.Player }
func (d *Deck) GetLabels() []string {
	if d.MacroArchetype != "" {
		return append([]string{d.MacroArchetype}, d.Labels...)
	}
	return d.Labels
}
func (d *Deck) GetDraftSize() int  { return d.DraftSize }
func (d *Deck) GetEventID() string { return d.Metadata.DraftID }
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

// ErrDeckNotFound is returned when no deck matches the (draftID, player) key.
var ErrDeckNotFound = errors.New("deck not found")

type DeckStorage interface {
	List(cube string, req *DecksRequest) ([]*Deck, error)
	UpdateDeckMeta(cube, draftID, player, macroArchetype string, labels, colors []string) (*Deck, error)
}




func filter(decks []*Deck, r *DecksRequest) []*Deck {
	// Check if we need to do any filtering. CommunityEdges alone never filters -
	// it's inert without a community: term in Match - so it's left out here.
	if r == nil || (r.Player == "" && r.Start == "" && r.End == "" && r.DraftSize == 0 && r.Match == "" && r.Board == "") {
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
		if r.Match != "" && !query.DeckMatchesBoardGraph(d, r.Match, r.Board, r.CommunityEdges) {
			continue
		}

		filtered = append(filtered, d)
	}
	return filtered
}
