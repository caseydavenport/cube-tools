package storage

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Store adds enrichment, caching, and filtering on top of a DeckBackend. It
// implements DeckStorage, so server handlers depend on it, not on any concrete
// backend.
type Store struct {
	sync.Mutex
	backend DeckBackend
	caches  map[string]*cubeCache
}

type cubeCache struct {
	decks    []*Deck
	lookup   map[key]*Deck
	loadedAt time.Time
}

// cacheTTL is how long a cube's cache is served before the next access
// reloads it from the backend.
const cacheTTL = 10 * time.Second

// NewStore wraps a backend with caching and enrichment.
func NewStore(backend DeckBackend) *Store {
	return &Store{backend: backend}
}

func (s *Store) List(cube string, req *DecksRequest) ([]*Deck, error) {
	s.Lock()
	defer s.Unlock()
	c, err := s.cacheForLocked(cube)
	if err != nil {
		return nil, err
	}
	return filter(c.decks, req), nil
}

// cacheForLocked returns the cube's cache, loading it from the backend and
// enriching on a miss. The caller must hold s.Mutex.
func (s *Store) cacheForLocked(cube string) (*cubeCache, error) {
	if s.caches == nil {
		s.caches = map[string]*cubeCache{}
	}
	if c, ok := s.caches[cube]; ok && time.Since(c.loadedAt) < cacheTTL {
		return c, nil
	}
	loaded, err := s.backend.RawDecks(cube)
	if err != nil {
		return nil, err
	}
	Enrich(loaded)
	c := &cubeCache{decks: loaded, lookup: map[key]*Deck{}, loadedAt: time.Now()}
	for _, d := range loaded {
		c.lookup[key{draft: d.Metadata.DraftID, id: d.ID}] = d
	}
	s.caches[cube] = c
	return c, nil
}

// UpdateDeckMeta applies an annotation write to one deck, saves it,
// invalidates the cube's cache, and returns the freshly enriched deck. It
// returns ErrUnsupported if the backend can't write and ErrDeckNotFound if the
// draft has no deck with w.DeckID.
func (s *Store) UpdateDeckMeta(cube string, w DeckMetaWrite) (*Deck, error) {
	backend, ok := s.backend.(DraftBackend)
	if !ok {
		return nil, ErrUnsupported
	}
	s.Lock()
	defer s.Unlock()
	decks, err := backend.LoadDraft(cube, w.DraftID)
	if err != nil {
		return nil, err
	}
	target := findDeck(decks, w.DeckID)
	if target == nil {
		return nil, ErrDeckNotFound
	}
	target.MacroArchetype = w.MacroArchetype
	target.Labels = w.Labels
	target.Colors = w.Colors
	if w.Notes != nil {
		target.Notes = *w.Notes
	}
	if err := backend.SaveDecks(cube, w.DraftID, []*Deck{target}); err != nil {
		return nil, err
	}
	changed, err := s.reloadLocked(cube, w.DraftID, []*Deck{target})
	if err != nil {
		return nil, err
	}
	return changed[0], nil
}

// SaveDeckRecord applies a record edit and reconciles the rest of the draft:
// references to a renamed player follow the new name, and the deck's per-round
// results are mirrored onto its opponents. It saves every changed deck,
// invalidates the cube's cache, and returns them freshly enriched. It returns
// ErrUnsupported if the backend can't write, ErrDeckNotFound if the draft has
// no deck with e.DeckID, and ErrPlayerExists if the new name (compared without
// case) belongs to another deck in the draft.
func (s *Store) SaveDeckRecord(cube string, e RecordEdit) ([]*Deck, error) {
	backend, ok := s.backend.(DraftBackend)
	if !ok {
		return nil, ErrUnsupported
	}
	s.Lock()
	defer s.Unlock()
	decks, err := backend.LoadDraft(cube, e.DraftID)
	if err != nil {
		return nil, err
	}
	target := findDeck(decks, e.DeckID)
	if target == nil {
		return nil, ErrDeckNotFound
	}
	if e.Player != "" {
		for _, d := range decks {
			if d != target && strings.EqualFold(d.Player, e.Player) {
				return nil, ErrPlayerExists
			}
		}
	}

	tds := make([]*types.Deck, len(decks))
	byTD := make(map[*types.Deck]*Deck, len(decks))
	for i, d := range decks {
		tds[i] = &d.Deck
		byTD[&d.Deck] = d
	}
	var changed []*Deck
	for _, td := range types.ReconcileRecord(tds, e.DeckID, e.Player, e.Matches) {
		changed = append(changed, byTD[td])
	}
	if err := backend.SaveDecks(cube, e.DraftID, changed); err != nil {
		return nil, err
	}
	return s.reloadLocked(cube, e.DraftID, changed)
}

// reloadLocked drops the cube's cache after a write and returns the freshly
// enriched copies of the given decks. The caller must hold s.Mutex.
func (s *Store) reloadLocked(cube string, draftID int, written []*Deck) ([]*Deck, error) {
	delete(s.caches, cube)
	c, err := s.cacheForLocked(cube)
	if err != nil {
		return nil, err
	}
	out := make([]*Deck, 0, len(written))
	for _, w := range written {
		d, ok := c.lookup[key{draft: draftID, id: w.ID}]
		if !ok {
			return nil, ErrDeckNotFound
		}
		out = append(out, d)
	}
	return out, nil
}

// findDeck returns the deck with the given ID, or nil.
func findDeck(decks []*Deck, id int) *Deck {
	for _, d := range decks {
		if d.ID == id {
			return d
		}
	}
	return nil
}

// GetRules returns the cube's design-map rules, or ErrUnsupported if the
// backend has none.
func (s *Store) GetRules(cube string) (*design.DesignMapConfig, error) {
	b, ok := s.backend.(RulesBackend)
	if !ok {
		return nil, ErrUnsupported
	}
	return b.GetRules(cube)
}

// PutRules writes the cube's design-map rules, or returns ErrUnsupported if
// the backend has none.
func (s *Store) PutRules(cube string, rules *design.DesignMapConfig) error {
	b, ok := s.backend.(RulesBackend)
	if !ok {
		return ErrUnsupported
	}
	return b.PutRules(cube, rules)
}

// Index returns the cube's path-free draft/deck index, or ErrUnsupported if
// the backend has none.
func (s *Store) Index(cube string) (*CubeIndex, error) {
	b, ok := s.backend.(IndexBackend)
	if !ok {
		return nil, ErrUnsupported
	}
	return b.Index(cube)
}

// GetDraftLog returns a draft's raw log, or ErrUnsupported if the backend has
// none.
func (s *Store) GetDraftLog(cube string, draftID int) (json.RawMessage, error) {
	b, ok := s.backend.(DraftLogBackend)
	if !ok {
		return nil, ErrUnsupported
	}
	return b.GetDraftLog(cube, draftID)
}
