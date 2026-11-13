package storage

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Deck wraps the on-disk types.Deck with the fields the server computes:
// flattened games, stats and opponent win rate.
type Deck struct {
	types.Deck `json:",inline"`

	// Games is a flattened list of all games in all matches, kept for the UI.
	Games []types.Game `json:"games"`

	// Stats are computed server side from the raw deck, so the UI doesn't
	// recompute them.
	Stats Stats `json:"stats"`

	// OpponentWinPercentage is the average win percentage of this deck's
	// opponents, excluding games against this deck.
	OpponentWinPercentage float64 `json:"opponent_win_percentage"`

	// RatedOpponents counts the opponents OpponentWinPercentage averages over:
	// those found in the draft with games against someone else. Zero means the
	// percentage is unknown, not 0%.
	RatedOpponents int `json:"rated_opponents"`

	// DraftSize is the number of seats in the draft, used for filtering.
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

// Stats is a deck's match and game tallies, with whether it won a trophy or
// came last.
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

// deckKey identifies a precise deck: its ID within its draft.
type deckKey struct {
	draft int
	id    int
}

// nameKey finds a deck by player name within its draft, for matches that only
// record the opponent's name.
type nameKey struct {
	draft  int
	player string
}

// DecksRequest is the filter a client sends to list decks. Empty fields don't
// filter; Start and End are inclusive dates in YYYY-MM-DD form, DraftSize is a
// minimum, and Match is a deck search query.
type DecksRequest struct {
	Player    string `json:"player,omitempty"`
	Start     string `json:"start,omitempty"`
	End       string `json:"end,omitempty"`
	DraftSize int    `json:"size,omitempty"`
	Match     string `json:"match,omitempty"`
	Board     string `json:"board,omitempty"`

	// Packages carries the cube's resolved packages for a package: term in
	// Match. The handler sets it only when Match needs it; nil means no
	// package filter.
	Packages []design.PackageCards `json:"-"`
}

// GetPlayer returns the deck's player name.
func (d *Deck) GetPlayer() string {
	return d.Player
}

// GetPlayGroup returns the deck's play group, the leftover group when unset.
func (d *Deck) GetPlayGroup() string {
	if d.PlayGroup == "" {
		return players.NoGroup
	}
	return d.PlayGroup
}

// GetDraftID returns the draft the deck was played in.
func (d *Deck) GetDraftID() int {
	return d.Metadata.DraftID
}

// IsAnonymous reports whether the deck is an anonymous seat: no player ID,
// shown by its seat label. Per-player rollups leave these out, since the same
// seat label recurs in every draft.
func (d *Deck) IsAnonymous() bool {
	return d.PlayerID == 0 && d.Player == players.SeatLabel(d.SeatNumber())
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

// GetLabels returns the deck's labels, led by its macro archetype when set.
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
	for _, term := range []string{d.Draft.EventCode, d.Draft.EventName, d.Draft.Flight} {
		if term != "" {
			out = append(out, term)
		}
	}
	return out
}

// GetMainboard returns a copy of the deck's mainboard.
func (d *Deck) GetMainboard() []types.Card {
	return slices.Clone(d.Mainboard)
}

// GetSideboard returns a copy of the deck's sideboard.
func (d *Deck) GetSideboard() []types.Card {
	return slices.Clone(d.Sideboard)
}

// GetPool returns a copy of the deck's card pool.
func (d *Deck) GetPool() []types.Card {
	return slices.Clone(d.Pool)
}

// ErrDeckNotFound is returned when no deck matches the (draftID, ID) key, or
// the draft itself doesn't exist.
var ErrDeckNotFound = errors.New("deck not found")

// DeckStorage is what server handlers use to list and annotate decks and to
// read a cube's rules, overrides and draft snapshots. Store implements it.
type DeckStorage interface {
	List(cube string, req *DecksRequest) ([]*Deck, error)
	UpdateDeckMeta(cube string, w DeckMetaWrite) (*Deck, error)

	// GetRules returns the cube's design-map rules. CubeCobra cubes get the
	// global rules, since CubeCobra has none.
	GetRules(cube string) (*design.DesignMapConfig, error)

	// GetOverrides returns the packages the cube forces on or off.
	GetOverrides(cube string) (design.PackageOverrides, error)

	// GetSnapshot returns the cube list a draft was played with, or an error
	// when there's none to read.
	GetSnapshot(cube string, draftID int) (*types.Cube, error)
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

// filter returns the decks that match every field r sets, in order. A nil r or
// one with no filtering fields returns decks itself.
func filter(decks []*Deck, r *DecksRequest) []*Deck {
	// Check if we need to do any filtering. Packages alone never filters - it's
	// inert without a package: term in Match - so it's left out here.
	if r == nil || (r.Player == "" && r.Start == "" && r.End == "" && r.DraftSize == 0 && r.Match == "" && r.Board == "") {
		return decks
	}

	// A search that doesn't parse matches no deck; the search bar shows why.
	match, err := search.Compile(r.Match, search.TargetDecks)
	if err != nil {
		logrus.WithError(err).WithField("match", r.Match).Info("deck search doesn't parse")
		return []*Deck{}
	}
	opts := search.DeckOptions{Board: r.Board, Packages: r.Packages}

	filtered := []*Deck{}
	for _, d := range decks {
		// Check player.
		if r.Player != "" && !strings.EqualFold(d.Player, r.Player) {
			continue
		}

		// Parse the deck's date.
		deckDate, err := time.Parse(time.DateOnly, d.Date)
		if err != nil {
			logrus.WithError(err).Warn("failed to parse deck date")
			continue
		}

		// Check start date.
		if r.Start != "" {
			start, err := time.Parse(time.DateOnly, r.Start)
			if err != nil {
				logrus.WithError(err).Warn("failed to parse start")
				continue
			}
			if deckDate.Before(start) {
				continue
			}
		}

		// Check end date.
		if r.End != "" {
			end, err := time.Parse(time.DateOnly, r.End)
			if err != nil {
				logrus.WithError(err).Warn("failed to parse end")
				continue
			}
			if deckDate.After(end) {
				continue
			}
		}

		if r.DraftSize != 0 && d.DraftSize < r.DraftSize {
			continue
		}

		// Check the query string.
		if !match.MatchDeck(d, opts) {
			continue
		}

		filtered = append(filtered, d)
	}
	return filtered
}
