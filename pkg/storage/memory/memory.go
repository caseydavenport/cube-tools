package memory

import (
	"encoding/json"
	"slices"
	"sync"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// Backend is an in-memory deck store for tests. It holds decks per cube and
// implements the full read/write deck contract.
type Backend struct {
	mu        sync.Mutex
	decks     map[string][]*storage.Deck
	rules     map[string]*design.DesignMapConfig
	index     map[string]*storage.CubeIndex
	draftLogs map[string]json.RawMessage
}

// New returns an empty in-memory backend.
func New() *Backend {
	return &Backend{
		decks:     map[string][]*storage.Deck{},
		rules:     map[string]*design.DesignMapConfig{},
		index:     map[string]*storage.CubeIndex{},
		draftLogs: map[string]json.RawMessage{},
	}
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

// Seed adds decks for a cube. Call before wrapping in a Store. A deck with no
// ID is numbered after the highest ID already in its draft, matching how
// writers number new decks.
func (b *Backend) Seed(cube string, decks ...*storage.Deck) {
	b.mu.Lock()
	defer b.mu.Unlock()
	highestIDByDraft := map[string]int{}
	for _, d := range b.decks[cube] {
		highestIDByDraft[d.Metadata.DraftID] = max(highestIDByDraft[d.Metadata.DraftID], d.ID)
	}
	for _, d := range decks {
		highestIDByDraft[d.Metadata.DraftID] = max(highestIDByDraft[d.Metadata.DraftID], d.ID)
	}
	for _, d := range decks {
		if d.ID == 0 {
			highestIDByDraft[d.Metadata.DraftID]++
			d.ID = highestIDByDraft[d.Metadata.DraftID]
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
		out[i] = copyDeck(d)
	}
	return out, nil
}

// LoadDraft returns copies of the draft's decks, or ErrDeckNotFound if the
// cube has no deck in that draft.
func (b *Backend) LoadDraft(cube, draftID string) ([]*storage.Deck, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []*storage.Deck
	for _, d := range b.decks[cube] {
		if d.Metadata.DraftID == draftID {
			out = append(out, copyDeck(d))
		}
	}
	if len(out) == 0 {
		return nil, storage.ErrDeckNotFound
	}
	return out, nil
}

// SaveDecks replaces the stored decks with the given ones, matched by ID
// within draftID.
func (b *Backend) SaveDecks(cube, draftID string, decks []*storage.Deck) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, d := range decks {
		i := slices.IndexFunc(b.decks[cube], func(s *storage.Deck) bool {
			return s.Metadata.DraftID == draftID && s.ID == d.ID
		})
		if i < 0 {
			return storage.ErrDeckNotFound
		}
		b.decks[cube][i] = copyDeck(d)
	}
	return nil
}

// copyDeck returns a copy of d whose matches and games can be changed without
// touching d's, since reconciling renames references inside both. Cards are
// shared; nothing edits them in place.
func copyDeck(d *storage.Deck) *storage.Deck {
	cp := *d
	cp.Matches = slices.Clone(d.Matches)
	for i := range cp.Matches {
		cp.Matches[i].Games = slices.Clone(cp.Matches[i].Games)
	}
	return &cp
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
