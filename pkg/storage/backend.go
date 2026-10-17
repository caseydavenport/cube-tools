package storage

import (
	"encoding/json"
	"errors"

	"github.com/caseydavenport/cube-tools/pkg/design"
)

// ErrUnsupported is returned by Store when the active backend does not implement
// the capability a caller asked for (for example, a read-only backend asked to
// write deck metadata).
var ErrUnsupported = errors.New("operation not supported by this storage backend")

// ErrPlayerExists is returned when a record edit would rename a deck to a
// player name another deck in the same draft already has.
var ErrPlayerExists = errors.New("another deck in this draft already has that player name")

// DeckBackend is a raw data source for one cube's decks. It performs no
// enrichment, caching, or filtering; Store layers those on top. Every backend
// implements this.
type DeckBackend interface {
	// RawDecks returns every deck for the cube with base fields and DraftSize
	// populated, but with Games, Stats, and OpponentWinPercentage left zero for
	// Enrich to fill in.
	RawDecks(cube string) ([]*Deck, error)
}

// DraftBackend is implemented by backends that can load and save one draft's
// decks. Store layers annotation writes and record reconciliation on top, so
// backends only do I/O. Read-only backends omit it, and Store reports
// ErrUnsupported for writes.
type DraftBackend interface {
	// LoadDraft returns every deck in the draft, or ErrDeckNotFound if the
	// draft doesn't exist.
	LoadDraft(cube, draftID string) ([]*Deck, error)

	// SaveDecks persists the given decks, each identified by its ID within
	// draftID. It returns ErrDeckNotFound for a deck the draft doesn't hold.
	SaveDecks(cube, draftID string, decks []*Deck) error
}

// RulesBackend is implemented by backends that can persist a cube's design-map
// rules.
type RulesBackend interface {
	GetRules(cube string) (*design.DesignMapConfig, error)
	PutRules(cube string, rules *design.DesignMapConfig) error
}

// IndexBackend is implemented by backends that can produce a path-free index
// of a cube's drafts and decks.
type IndexBackend interface {
	Index(cube string) (*CubeIndex, error)
}

// DraftLogBackend is implemented by backends that can return a draft's raw
// log. The log's shape is backend-defined, so Store passes it through
// unparsed.
type DraftLogBackend interface {
	GetDraftLog(cube, draftID string) (json.RawMessage, error)
}
