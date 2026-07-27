package file

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// Backend reads and writes decks from the on-disk data/<cube>/ layout.
type Backend struct {
	src types.CubeSource
}

// New returns a filesystem-backed deck backend. src overlays each deck's cards
// with the cube's live printings and tags; pass nil outside the server (CLI,
// tests) where there is no live cube.
func New(src types.CubeSource) *Backend {
	return &Backend{src: src}
}

// NewStore wires a filesystem backend into a Store.
func NewStore(src types.CubeSource) *storage.Store {
	return storage.NewStore(New(src))
}

// RawDecks loads every deck listed in the cube's index, overlays cube printings
// and tags, and sets DraftSize. It does not enrich; Store does that.
func (b *Backend) RawDecks(cube string) ([]*storage.Deck, error) {
	logrus.Info("Loading decks from disk")
	contents, err := os.ReadFile(fmt.Sprintf("data/%s/index.json", cube))
	if err != nil {
		return nil, err
	}
	var index commands.MainIndex
	if err := json.Unmarshal(contents, &index); err != nil {
		return nil, err
	}

	var decks []*storage.Deck
	for _, draft := range index.Drafts {
		for _, deck := range draft.Decks {
			d, err := loadDeck(deck.Path)
			if err != nil {
				logrus.WithError(err).Warn("Failed to load deck")
				continue
			}
			d.DraftSize = len(draft.Decks)
			d.ID = d.Player
			d.Metadata.Path = ""
			decks = append(decks, &d)
		}
	}

	overlay := cubeCards(cube, b.src)
	for _, d := range decks {
		overlayCubeCards(d.Mainboard, overlay)
		overlayCubeCards(d.Sideboard, overlay)
		overlayCubeCards(d.Pool, overlay)
	}
	return decks, nil
}

// WriteDeckMeta rewrites the macro archetype, labels, and color override on the
// deck's on-disk file, loading the whole deck first so other fields survive. An
// empty colors slice clears the override.
func (b *Backend) WriteDeckMeta(cube string, w storage.DeckMetaWrite) (*storage.Deck, error) {
	path, err := b.deckFilePath(cube, w.DraftID, w.DeckID)
	if err != nil {
		return nil, err
	}
	d, err := types.LoadDeck(path)
	if err != nil {
		return nil, err
	}
	d.MacroArchetype = w.MacroArchetype
	d.Labels = w.Labels
	d.Colors = w.Colors
	if w.Player != "" {
		d.Player = w.Player
	}
	if w.Matches != nil {
		d.Matches = w.Matches
	}
	if err := d.Save(path); err != nil {
		return nil, err
	}
	return &storage.Deck{Deck: *d}, nil
}

// SaveDeckRecord loads every deck in the draft, applies the record edit via
// ReconcileRecord, and writes each changed deck's file whole so unrelated
// fields survive. It returns the changed decks with their ids set.
func (b *Backend) SaveDeckRecord(cube, draftID, deckID, player string, matches []types.Match) ([]*storage.Deck, error) {
	contents, err := os.ReadFile(fmt.Sprintf("data/%s/index.json", cube))
	if err != nil {
		return nil, err
	}
	var index commands.MainIndex
	if err := json.Unmarshal(contents, &index); err != nil {
		return nil, err
	}

	var loaded []*storage.Deck
	paths := map[*types.Deck]string{}
	found := false
	for _, draft := range index.Drafts {
		if draft.DraftID != draftID {
			continue
		}
		found = true
		for _, ideck := range draft.Decks {
			d, err := types.LoadDeck(ideck.Path)
			if err != nil {
				return nil, err
			}
			sd := &storage.Deck{Deck: *d}
			sd.ID = sd.Player
			loaded = append(loaded, sd)
			paths[&sd.Deck] = ideck.Path
		}
	}
	if !found {
		return nil, storage.ErrDeckNotFound
	}

	targetOldName := ""
	for _, sd := range loaded {
		if sd.ID == deckID {
			targetOldName = sd.Player
			break
		}
	}
	if targetOldName == "" {
		return nil, storage.ErrDeckNotFound
	}

	tds := make([]*types.Deck, len(loaded))
	byTD := map[*types.Deck]*storage.Deck{}
	for i, sd := range loaded {
		tds[i] = &sd.Deck
		byTD[&sd.Deck] = sd
	}
	changed := types.ReconcileRecord(tds, targetOldName, player, matches)

	var out []*storage.Deck
	for _, td := range changed {
		if err := td.Save(paths[td]); err != nil {
			return nil, err
		}
		sd := byTD[td]
		sd.ID = sd.Player
		out = append(out, sd)
	}
	return out, nil
}

// deckFilePath returns the on-disk file for a deck by loading the cube's index
// and matching the draft and player (the file backend's id). It keeps path
// resolution inside the backend so callers never handle filesystem paths.
func (b *Backend) deckFilePath(cube, draftID, deckID string) (string, error) {
	contents, err := os.ReadFile(fmt.Sprintf("data/%s/index.json", cube))
	if err != nil {
		return "", err
	}
	var index commands.MainIndex
	if err := json.Unmarshal(contents, &index); err != nil {
		return "", err
	}
	for _, draft := range index.Drafts {
		if draft.DraftID != draftID {
			continue
		}
		for _, ideck := range draft.Decks {
			d, err := loadDeck(ideck.Path)
			if err != nil {
				continue
			}
			if d.Player == deckID {
				return ideck.Path, nil
			}
		}
	}
	return "", storage.ErrDeckNotFound
}

func loadDeck(path string) (storage.Deck, error) {
	var d storage.Deck
	contents, err := os.ReadFile(path)
	if err != nil {
		return d, err
	}
	if err = json.Unmarshal(contents, &d); err != nil {
		return d, err
	}
	return d, nil
}

// validPathComponent rejects an id that could escape the data directory it's
// interpolated into, e.g. a draft or deck id containing a path separator or
// "..".
func validPathComponent(id string) error {
	if strings.ContainsAny(id, `/\`) || strings.Contains(id, "..") {
		return fmt.Errorf("invalid id %q", id)
	}
	return nil
}

// GetNotes returns the free-form notes saved against a deck, or "" if none
// have been saved yet.
func (b *Backend) GetNotes(cube, draftID, deckID string) (string, error) {
	if err := validPathComponent(draftID); err != nil {
		return "", err
	}
	if err := validPathComponent(deckID); err != nil {
		return "", err
	}
	path := strings.ToLower(fmt.Sprintf("data/%s/%s/%s.report.md", cube, draftID, deckID))
	contents, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(contents), nil
}

// PutNotes saves free-form notes against a deck, creating the draft directory
// if needed.
func (b *Backend) PutNotes(cube, draftID, deckID, content string) error {
	if err := validPathComponent(draftID); err != nil {
		return err
	}
	if err := validPathComponent(deckID); err != nil {
		return err
	}
	path := strings.ToLower(fmt.Sprintf("data/%s/%s/%s.report.md", cube, draftID, deckID))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

// GetRules returns a cube's design-map rules.
func (b *Backend) GetRules(cube string) (*design.DesignMapConfig, error) {
	data, err := os.ReadFile(fmt.Sprintf("data/%s/cube-rules.json", cube))
	if err != nil {
		return nil, err
	}
	var config design.DesignMapConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	return &config, nil
}

// PutRules saves a cube's design-map rules.
func (b *Backend) PutRules(cube string, rules *design.DesignMapConfig) error {
	data, err := json.MarshalIndent(rules, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(fmt.Sprintf("data/%s/cube-rules.json", cube), data, 0o644)
}

// Index returns the path-free index of a cube's drafts and decks.
func (b *Backend) Index(cube string) (*storage.CubeIndex, error) {
	contents, err := os.ReadFile(fmt.Sprintf("data/%s/index.json", cube))
	if err != nil {
		return nil, err
	}
	var index commands.MainIndex
	if err := json.Unmarshal(contents, &index); err != nil {
		return nil, err
	}

	out := &storage.CubeIndex{}
	for _, draft := range index.Drafts {
		id := storage.IndexedDraft{
			DraftID: draft.DraftID,
			Date:    draft.Date,
			HasLog:  draft.DraftLog != "",
		}
		for _, ideck := range draft.Decks {
			d, err := loadDeck(ideck.Path)
			if err != nil {
				logrus.WithError(err).Warn("Failed to load deck")
				continue
			}
			id.Decks = append(id.Decks, storage.IndexedDeck{ID: d.Player})
		}
		out.Drafts = append(out.Drafts, id)
	}
	return out, nil
}

// GetDraftLog returns a draft's raw log bytes.
func (b *Backend) GetDraftLog(cube, draftID string) (json.RawMessage, error) {
	if err := validPathComponent(draftID); err != nil {
		return nil, err
	}
	path := fmt.Sprintf("data/%s/%s/draft-log.json", cube, draftID)
	contents, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, storage.ErrDeckNotFound
		}
		return nil, err
	}
	return json.RawMessage(contents), nil
}

type cubeCard struct {
	image string
	url   string
	tags  []string
}

// cubeCards maps card name to the printing and tags a deck card inherits from the
// current cube. Returns nil when there is no live cube to overlay.
func cubeCards(cube string, src types.CubeSource) map[string]cubeCard {
	if src == nil {
		return nil
	}
	c, err := src.Current(cube)
	if err != nil {
		logrus.WithError(err).Warn("Failed to load cube; decks will use oracle printings and no tags")
		return nil
	}
	out := make(map[string]cubeCard, len(c.Cards))
	for _, card := range c.Cards {
		out[card.Name] = cubeCard{image: card.Image, url: card.URL, tags: card.Tags}
	}
	return out
}

// overlayCubeCards replaces each card's printing and tags with the cube's when the
// card is in the cube. Cards cut since the deck was built keep their oracle
// printing and stay tagless.
func overlayCubeCards(cards []types.Card, cube map[string]cubeCard) {
	for i := range cards {
		cc, ok := cube[cards[i].Name]
		if !ok {
			continue
		}
		if cc.image != "" {
			cards[i].Image = cc.image
		}
		if cc.url != "" {
			cards[i].URL = cc.url
		}
		if len(cc.tags) > 0 {
			cards[i].Tags = cc.tags
		}
	}
}
