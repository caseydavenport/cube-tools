package storage

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Store adds enrichment, caching, and filtering on top of a Backend. It
// implements DeckStorage, so server handlers depend on it, not on any concrete
// backend.
type Store struct {
	sync.Mutex
	backend Backend
	players PlayerSource
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

// NewStore wraps a backend with caching, name resolution and enrichment.
func NewStore(backend Backend, opts ...StoreOption) *Store {
	s := &Store{backend: backend}
	for _, o := range opts {
		o(s)
	}
	return s
}

// playerList returns the current player list, or nil when the Store has no
// source.
func (s *Store) playerList() (*players.List, error) {
	if s.players == nil {
		return nil, nil
	}
	return s.players.Players()
}

// resolve fills in display names on decks, which may span several drafts.
func (s *Store) resolve(decks []*Deck) error {
	pl, err := s.playerList()
	if err != nil {
		return err
	}
	byDraft := map[int][]*types.Deck{}
	var order []int
	for _, d := range decks {
		if _, ok := byDraft[d.Metadata.DraftID]; !ok {
			order = append(order, d.Metadata.DraftID)
		}
		byDraft[d.Metadata.DraftID] = append(byDraft[d.Metadata.DraftID], &d.Deck)
	}
	for _, id := range order {
		pl.ResolveDraft(byDraft[id])
	}
	return nil
}

// InvalidatePlayers drops every cached cube, so the next read resolves the
// current player names. Call it after renaming a player.
func (s *Store) InvalidatePlayers() {
	s.Lock()
	defer s.Unlock()
	s.caches = nil
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
	if err := s.resolve(loaded); err != nil {
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
// returns ErrReadOnly if the cube can't be written and ErrDeckNotFound if the
// draft has no deck with w.DeckID.
func (s *Store) UpdateDeckMeta(cube string, w DeckMetaWrite) (*Deck, error) {
	if !s.backend.Writable(cube) {
		return nil, ErrReadOnly
	}
	s.Lock()
	defer s.Unlock()
	decks, err := s.backend.LoadDraft(cube, w.DraftID)
	if err != nil {
		return nil, err
	}
	if err := s.resolve(decks); err != nil {
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
	if err := s.backend.SaveDecks(cube, w.DraftID, []*Deck{target}); err != nil {
		return nil, err
	}
	changed, err := s.reloadLocked(cube, w.DraftID, []*Deck{target})
	if err != nil {
		return nil, err
	}
	return changed[0], nil
}

// SaveDeckRecord applies a record edit: it reassigns the deck's player and
// replaces its matches, mirroring the per-round results onto its opponents.
// It saves every changed deck, invalidates the cube's cache, and returns them
// freshly enriched. It returns ErrReadOnly if the cube can't be written,
// ErrDeckNotFound if the draft has no deck with e.DeckID, ErrUnknownPlayer for
// a player ID not in the list, and ErrPlayerExists if another deck in the
// draft already has that player.
func (s *Store) SaveDeckRecord(cube string, e RecordEdit) ([]*Deck, error) {
	if !s.backend.Writable(cube) {
		return nil, ErrReadOnly
	}
	s.Lock()
	defer s.Unlock()
	decks, err := s.backend.LoadDraft(cube, e.DraftID)
	if err != nil {
		return nil, err
	}
	target := findDeck(decks, e.DeckID)
	if target == nil {
		return nil, ErrDeckNotFound
	}
	if e.PlayerID != nil {
		if err := s.assignPlayer(decks, target, *e.PlayerID); err != nil {
			return nil, err
		}
	}
	if err := s.resolve(decks); err != nil {
		return nil, err
	}

	changed := []*Deck{target}
	if e.Matches != nil {
		tds := make([]*types.Deck, len(decks))
		byTD := make(map[*types.Deck]*Deck, len(decks))
		for i, d := range decks {
			tds[i] = &d.Deck
			byTD[&d.Deck] = d
		}
		changed = changed[:0]
		for _, td := range types.ReconcileRecord(tds, e.DeckID, e.Matches) {
			changed = append(changed, byTD[td])
		}
	}
	if err := s.backend.SaveDecks(cube, e.DraftID, changed); err != nil {
		return nil, err
	}
	return s.reloadLocked(cube, e.DraftID, changed)
}

// assignPlayer points target at playerID, or makes it anonymous for zero,
// after checking the player exists and holds no other deck in the draft.
func (s *Store) assignPlayer(decks []*Deck, target *Deck, playerID int) error {
	if playerID != 0 {
		pl, err := s.playerList()
		if err != nil {
			return err
		}
		if _, ok := pl.ByID(playerID); !ok {
			return fmt.Errorf("%w: id %d", ErrUnknownPlayer, playerID)
		}
		for _, d := range decks {
			if d != target && d.PlayerID == playerID {
				return ErrPlayerExists
			}
		}
	}
	target.PlayerID = playerID

	// Clear the stale name so resolving gives the new player's name or, for
	// an anonymous deck, its seat label.
	target.Player = ""
	return nil
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

// Writable reports whether the cube accepts writes.
func (s *Store) Writable(cube string) bool {
	return s.backend.Writable(cube)
}

// GetRules returns the cube's design-map rules.
func (s *Store) GetRules(cube string) (*design.DesignMapConfig, error) {
	return s.backend.GetRules(cube)
}

// PutRules writes the cube's design-map rules, or returns ErrReadOnly if the
// cube can't be written.
func (s *Store) PutRules(cube string, rules *design.DesignMapConfig) error {
	if !s.backend.Writable(cube) {
		return ErrReadOnly
	}
	return s.backend.PutRules(cube, rules)
}

// Index returns the cube's path-free draft/deck index.
func (s *Store) Index(cube string) (*CubeIndex, error) {
	return s.backend.Index(cube)
}

// GetDraftLog returns a draft's raw log, or ErrUnsupported if the cube keeps
// none.
func (s *Store) GetDraftLog(cube string, draftID int) (json.RawMessage, error) {
	return s.backend.GetDraftLog(cube, draftID)
}
