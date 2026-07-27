package memory

import (
	"encoding/json"
	"sync"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// Backend is an in-memory deck store for tests. It holds decks per cube and
// implements the full read/write deck contract.
type Backend struct {
	mu        sync.Mutex
	decks     map[string][]*storage.Deck
	notes     map[string]string
	rules     map[string]*design.DesignMapConfig
	index     map[string]*storage.CubeIndex
	draftLogs map[string]json.RawMessage
}

// New returns an empty in-memory backend.
func New() *Backend {
	return &Backend{
		decks:     map[string][]*storage.Deck{},
		notes:     map[string]string{},
		rules:     map[string]*design.DesignMapConfig{},
		index:     map[string]*storage.CubeIndex{},
		draftLogs: map[string]json.RawMessage{},
	}
}

// notesKey builds the map key for a deck's notes.
func notesKey(cube, draftID, deckID string) string {
	return cube + "\x00" + draftID + "\x00" + deckID
}

// draftLogKey builds the map key for a draft's log.
func draftLogKey(cube, draftID string) string {
	return cube + "\x00" + draftID
}

// NewStore builds a Store over a fresh in-memory backend, applying seed if given.
func NewStore(seed func(*Backend)) *storage.Store {
	b := New()
	if seed != nil {
		seed(b)
	}
	return storage.NewStore(b)
}

// Seed adds decks for a cube. Call before wrapping in a Store. Defaults ID to
// Player when unset, matching RawDecks, since WriteDeckMeta matches by ID
// against these stored decks directly.
func (b *Backend) Seed(cube string, decks ...*storage.Deck) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, d := range decks {
		if d.ID == "" {
			d.ID = d.Player
		}
	}
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
func (b *Backend) WriteDeckMeta(cube string, w storage.DeckMetaWrite) (*storage.Deck, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, d := range b.decks[cube] {
		if d.ID == w.DeckID && d.Metadata.DraftID == w.DraftID {
			d.MacroArchetype = w.MacroArchetype
			d.Labels = w.Labels
			d.Colors = w.Colors
			if w.Player != "" {
				d.Player = w.Player
			}
			if w.Matches != nil {
				d.Matches = w.Matches
			}
			cp := *d
			return &cp, nil
		}
	}
	return nil, storage.ErrDeckNotFound
}

// GetNotes returns the free-form notes saved against a deck, or "" if none
// have been saved yet.
func (b *Backend) GetNotes(cube, draftID, deckID string) (string, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.notes[notesKey(cube, draftID, deckID)], nil
}

// PutNotes saves free-form notes against a deck.
func (b *Backend) PutNotes(cube, draftID, deckID, content string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.notes[notesKey(cube, draftID, deckID)] = content
	return nil
}

// GetRules returns a cube's design-map rules.
func (b *Backend) GetRules(cube string) (*design.DesignMapConfig, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	r, ok := b.rules[cube]
	if !ok {
		return nil, storage.ErrDeckNotFound
	}
	return r, nil
}

// PutRules saves a cube's design-map rules.
func (b *Backend) PutRules(cube string, rules *design.DesignMapConfig) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.rules[cube] = rules
	return nil
}

// Index returns the path-free index of a cube's drafts and decks.
func (b *Backend) Index(cube string) (*storage.CubeIndex, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	idx, ok := b.index[cube]
	if !ok {
		return nil, storage.ErrDeckNotFound
	}
	return idx, nil
}

// GetDraftLog returns a draft's raw log bytes.
func (b *Backend) GetDraftLog(cube, draftID string) (json.RawMessage, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	log, ok := b.draftLogs[draftLogKey(cube, draftID)]
	if !ok {
		return nil, storage.ErrDeckNotFound
	}
	return log, nil
}

// SeedNotes preloads notes for a deck. Call before wrapping in a Store.
func (b *Backend) SeedNotes(cube, draftID, deckID, content string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.notes[notesKey(cube, draftID, deckID)] = content
}

// SeedRules preloads a cube's design-map rules. Call before wrapping in a Store.
func (b *Backend) SeedRules(cube string, rules *design.DesignMapConfig) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.rules[cube] = rules
}

// SeedIndex preloads a cube's index. Call before wrapping in a Store.
func (b *Backend) SeedIndex(cube string, idx *storage.CubeIndex) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.index[cube] = idx
}

// SeedDraftLog preloads a draft's raw log bytes. Call before wrapping in a Store.
func (b *Backend) SeedDraftLog(cube, draftID string, log json.RawMessage) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.draftLogs[draftLogKey(cube, draftID)] = log
}
