package storage

import (
	"encoding/json"
	"errors"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ErrUnsupported is returned by Store when the active backend does not implement
// the capability a caller asked for (for example, a read-only backend asked to
// write deck metadata).
var ErrUnsupported = errors.New("operation not supported by this storage backend")

// DeckBackend is a raw data source for one cube's decks. It performs no
// enrichment, caching, or filtering; Store layers those on top. Every backend
// implements this.
type DeckBackend interface {
	// RawDecks returns every deck for the cube with base fields and DraftSize
	// populated, but with Games, Stats, and OpponentWinPercentage left zero for
	// Enrich to fill in.
	RawDecks(cube string) ([]*Deck, error)
}

// DeckMetaBackend is implemented by backends that can persist cube-tools' own
// deck annotations (macro archetype, labels, color override). Read-only backends
// omit it, so Store reports ErrUnsupported.
type DeckMetaBackend interface {
	WriteDeckMeta(cube string, w DeckMetaWrite) (*Deck, error)
}

// DraftRecordBackend is implemented by backends that can save a deck's record
// and reconcile the rest of its draft: renaming references to the edited
// player and mirroring its per-round results onto its opponents. It returns
// every deck it changed.
type DraftRecordBackend interface {
	SaveDeckRecord(cube, draftID, deckID, player string, matches []types.Match) ([]*Deck, error)
}

// NotesBackend is implemented by backends that can persist free-form notes
// against a deck.
type NotesBackend interface {
	GetNotes(cube, draftID, deckID string) (string, error)
	PutNotes(cube, draftID, deckID, content string) error
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
