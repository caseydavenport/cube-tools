package storage

import (
	"encoding/json"
	"errors"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/players"
)

// ErrUnsupported is returned when a cube has no data of the kind asked for,
// such as a draft log for a CubeCobra cube.
var ErrUnsupported = errors.New("operation not supported by this storage backend")

// ErrReadOnly is returned by writes to a cube the backend can't write.
var ErrReadOnly = errors.New("this cube is read-only")

// ErrPlayerExists is returned when a record edit would assign a deck to a
// player who already has another deck in the same draft.
var ErrPlayerExists = errors.New("that player already has a deck in this draft")

// ErrUnknownPlayer is returned when a record edit names a player ID that isn't
// in the player list.
var ErrUnknownPlayer = players.ErrUnknownPlayer

// Backend is a raw data source for cubes' decks, rules, indexes and draft
// logs. It performs no enrichment, caching, or filtering; Store layers those
// on top. Whether a cube can be written is a per-cube answer from Writable.
type Backend interface {
	// RawDecks returns every deck for the cube with base fields and DraftSize
	// populated, but with Games, Stats, and OpponentWinPercentage left zero for
	// Enrich to fill in.
	RawDecks(cube string) ([]*Deck, error)

	// LoadDraft returns every deck in the draft, or ErrDeckNotFound if the
	// draft doesn't exist.
	LoadDraft(cube string, draftID int) ([]*Deck, error)

	// SaveDecks persists the given decks, each identified by its ID within
	// draftID. It returns ErrDeckNotFound for a deck the draft doesn't hold.
	SaveDecks(cube string, draftID int, decks []*Deck) error

	GetRules(cube string) (*design.DesignMapConfig, error)
	PutRules(cube string, rules *design.DesignMapConfig) error

	// Index returns a path-free index of the cube's drafts and decks.
	Index(cube string) (*CubeIndex, error)

	// GetDraftLog returns a draft's raw log. Its shape is backend-defined, so
	// Store passes it through unparsed.
	GetDraftLog(cube string, draftID int) (json.RawMessage, error)

	// Writable reports whether the cube accepts writes.
	Writable(cube string) bool
}
