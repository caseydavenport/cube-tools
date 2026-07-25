package storage

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/design"
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
		c.lookup[key{id: d.ID, draft: d.Metadata.DraftID}] = d
	}
	s.caches[cube] = c
	return c, nil
}

// UpdateDeckMeta writes the annotation via the backend (if it supports writes),
// invalidates the cube's cache, and returns the freshly enriched deck.
func (s *Store) UpdateDeckMeta(cube, draftID, deckID, macroArchetype string, labels, colors []string) (*Deck, error) {
	w, ok := s.backend.(DeckMetaBackend)
	if !ok {
		return nil, ErrUnsupported
	}
	s.Lock()
	defer s.Unlock()
	if _, err := w.WriteDeckMeta(cube, draftID, deckID, macroArchetype, labels, colors); err != nil {
		return nil, err
	}
	delete(s.caches, cube)
	c, err := s.cacheForLocked(cube)
	if err != nil {
		return nil, err
	}
	updated, ok := c.lookup[key{id: deckID, draft: draftID}]
	if !ok {
		return nil, ErrDeckNotFound
	}
	return updated, nil
}

// GetNotes returns the deck's notes, or ErrUnsupported if the backend has none.
func (s *Store) GetNotes(cube, draftID, deckID string) (string, error) {
	b, ok := s.backend.(NotesBackend)
	if !ok {
		return "", ErrUnsupported
	}
	return b.GetNotes(cube, draftID, deckID)
}

// PutNotes writes the deck's notes, or returns ErrUnsupported if the backend
// has none.
func (s *Store) PutNotes(cube, draftID, deckID, content string) error {
	b, ok := s.backend.(NotesBackend)
	if !ok {
		return ErrUnsupported
	}
	return b.PutNotes(cube, draftID, deckID, content)
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
func (s *Store) GetDraftLog(cube, draftID string) (json.RawMessage, error) {
	b, ok := s.backend.(DraftLogBackend)
	if !ok {
		return nil, ErrUnsupported
	}
	return b.GetDraftLog(cube, draftID)
}
