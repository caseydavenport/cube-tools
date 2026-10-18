package storage

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/players"
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

	// Draft describes the draft the deck was played in, for display.
	Draft DraftInfo `json:"draft"`
}

// DraftInfo is the part of a draft's metadata clients need to label and order
// it: its ID, date, and event details.
type DraftInfo struct {
	ID        int    `json:"id"`
	Date      string `json:"date"`
	EventName string `json:"event_name,omitempty"`
	EventCode string `json:"event_code,omitempty"`
	Flight    string `json:"flight,omitempty"`
}

// NewDraftInfo picks the display fields out of a draft's metadata.
func NewDraftInfo(m types.DraftMetadata) DraftInfo {
	return DraftInfo{ID: m.ID, Date: m.Date, EventName: m.EventName, EventCode: m.EventCode, Flight: m.Flight}
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

// key identifies a precise deck: its ID within its draft.
type key struct {
	draft int
	id    int
}

// nameKey finds a deck by player name within its draft, for matches that only
// record the opponent's name.
type nameKey struct {
	draft  int
	player string
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

// IsAnonymous reports whether the deck is an anonymous seat: no player ID,
// shown by its seat label. Per-player rollups leave these out, since the same
// seat label recurs in every draft.
func (d *Deck) IsAnonymous() bool {
	return d.PlayerID == 0 && d.Player == players.SeatLabel(d.ID)
}

// PersonLabel names who played the deck, distinct across a cube's drafts: the
// player's name, or for an anonymous seat its label and draft. Use it to count
// or list distinct people, where bare seat labels would merge.
func (d *Deck) PersonLabel() string {
	if d.IsAnonymous() {
		return fmt.Sprintf("%s (draft %d)", d.Player, d.Metadata.DraftID)
	}
	return d.Player
}

func (d *Deck) GetLabels() []string {
	if d.MacroArchetype != "" {
		return append([]string{d.MacroArchetype}, d.Labels...)
	}
	return d.Labels
}

// GetDraftSize returns the size of the draft the deck came from.
func (d *Deck) GetDraftSize() int {
	return d.DraftSize
}

// GetEventTerms returns the deck's event code, event name, and flight, skipping
// any that are empty.
func (d *Deck) GetEventTerms() []string {
	var out []string
	for _, t := range []string{d.Draft.EventCode, d.Draft.EventName, d.Draft.Flight} {
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

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

// ErrDeckNotFound is returned when no deck matches the (draftID, ID) key, or
// the draft itself doesn't exist.
var ErrDeckNotFound = errors.New("deck not found")

type DeckStorage interface {
	List(cube string, req *DecksRequest) ([]*Deck, error)
	UpdateDeckMeta(cube string, w DeckMetaWrite) (*Deck, error)

	// GetRules returns the cube's design-map rules, or ErrUnsupported if the
	// backend has none (e.g. a read-only cc: cube).
	GetRules(cube string) (*design.DesignMapConfig, error)
}

// DeckMetaWrite carries the annotation fields for a deck. MacroArchetype,
// Labels and Colors are replaced as given; an empty Colors clears the override.
// Notes nil leaves the notes unchanged, a pointer to "" clears them.
type DeckMetaWrite struct {
	DraftID        int
	DeckID         int
	MacroArchetype string
	Labels         []string
	Colors         []string
	Notes          *string
}

// RecordEdit carries a change to a deck's player and match record. PlayerID
// nil leaves the player unchanged, zero makes the deck an anonymous seat, and
// anything else assigns that player. Matches nil leaves the record unchanged;
// an empty non-nil slice clears it.
type RecordEdit struct {
	DraftID  int
	DeckID   int
	PlayerID *int
	Matches  []types.Match
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
