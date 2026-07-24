package memory

import (
	"sync"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// Backend is an in-memory deck store for tests. It holds decks per cube and
// implements the full read/write deck contract.
type Backend struct {
	mu    sync.Mutex
	decks map[string][]*storage.Deck
}

// New returns an empty in-memory backend.
func New() *Backend {
	return &Backend{decks: map[string][]*storage.Deck{}}
}

// NewStore builds a Store over a fresh in-memory backend, applying seed if given.
func NewStore(seed func(*Backend)) *storage.Store {
	b := New()
	if seed != nil {
		seed(b)
	}
	return storage.NewStore(b)
}

// Seed adds decks for a cube. Call before wrapping in a Store.
func (b *Backend) Seed(cube string, decks ...*storage.Deck) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.decks[cube] = append(b.decks[cube], decks...)
}

// RawDecks returns copies of the cube's decks so enrichment never mutates the
// seeded originals across calls.
func (b *Backend) RawDecks(cube string) ([]*storage.Deck, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	src := b.decks[cube]
	out := make([]*storage.Deck, len(src))
	for i, d := range src {
		cp := *d
		if cp.ID == "" {
			cp.ID = cp.Player
		}
		out[i] = &cp
	}
	return out, nil
}

// WriteDeckMeta updates the annotation on the stored deck in place.
func (b *Backend) WriteDeckMeta(cube, draftID, player, macroArchetype string, labels, colors []string) (*storage.Deck, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, d := range b.decks[cube] {
		if d.Player == player && d.Metadata.DraftID == draftID {
			d.MacroArchetype = macroArchetype
			d.Labels = labels
			d.Colors = colors
			cp := *d
			return &cp, nil
		}
	}
	return nil, storage.ErrDeckNotFound
}
