package storage

import "errors"

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
	WriteDeckMeta(cube, draftID, player, macroArchetype string, labels, colors []string) (*Deck, error)
}
