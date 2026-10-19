package file

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
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

// NewStore wires a filesystem backend into a Store that resolves player names
// from data/players.json.
func NewStore(src types.CubeSource) *storage.Store {
	return storage.NewStore(New(src), storage.WithPlayers(players.FileSource{DataRoot: "data"}))
}

// Writable reports that every file cube accepts writes.
func (b *Backend) Writable(string) bool {
	return true
}

// RawDecks loads every deck in the cube's draft directories, overlays cube
// printings and tags, and sets DraftSize. A draft whose decks won't load is
// logged and skipped. It does not enrich; Store does that.
func (b *Backend) RawDecks(cube string) ([]*storage.Deck, error) {
	logrus.Info("Loading decks from disk")
	all, err := drafts.List(filepath.Join("data", cube))
	if err != nil {
		return nil, err
	}

	var decks []*storage.Deck
	for _, draft := range all {
		loaded, seats, ok := readableDecks(draft)
		if !ok {
			continue
		}
		info := storage.NewDraftInfo(draft.DraftMetadata)
		for _, d := range loaded {
			deck := &storage.Deck{Deck: *d}
			deck.DraftSize = seats
			deck.Draft = info
			deck.Metadata.Path = ""
			decks = append(decks, deck)
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

// LoadDraft returns every deck in the draft's directory, or ErrDeckNotFound if
// it holds none. It refuses a draft where a deck has no ID or two decks share
// one, since writes find their file by ID and would otherwise overwrite the
// wrong deck.
func (b *Backend) LoadDraft(cube string, draftID int) ([]*storage.Deck, error) {
	draft, err := findDraft(cube, draftID)
	if err != nil {
		return nil, err
	}
	if err := draft.CheckDeckIDs(); err != nil {
		return nil, err
	}
	decks, err := draft.Decks()
	if err != nil {
		return nil, err
	}
	if len(decks) == 0 {
		return nil, storage.ErrDeckNotFound
	}
	out := make([]*storage.Deck, 0, len(decks))
	for _, d := range decks {
		out = append(out, &storage.Deck{Deck: *d})
	}
	return out, nil
}

// SaveDecks writes each deck back to the file in the draft's directory that
// holds its ID, so a renamed player keeps the same file. It returns
// ErrDeckNotFound for an ID no file in the draft has, rather than creating one.
func (b *Backend) SaveDecks(cube string, draftID int, decks []*storage.Deck) error {
	draft, err := findDraft(cube, draftID)
	if err != nil {
		return err
	}
	for _, d := range decks {
		if _, err := draft.Deck(d.ID); err != nil {
			if errors.Is(err, drafts.ErrNotFound) {
				return storage.ErrDeckNotFound
			}
			return err
		}
		td := d.Deck
		if err := draft.SaveDeck(&td); err != nil {
			return fmt.Errorf("save deck %d: %w", d.ID, err)
		}
	}
	return nil
}

// findDraft resolves a draft ID to its directory under the data root,
// mapping an unknown ID to ErrDeckNotFound.
func findDraft(cube string, draftID int) (drafts.Draft, error) {
	draft, err := drafts.Find(filepath.Join("data", cube), draftID)
	if errors.Is(err, drafts.ErrNotFound) {
		return drafts.Draft{}, storage.ErrDeckNotFound
	}
	return draft, err
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

// Index returns the path-free index of a cube's drafts and decks. A cube with
// no drafts, or no directory, has an empty index.
func (b *Backend) Index(cube string) (*storage.CubeIndex, error) {
	all, err := drafts.List(filepath.Join("data", cube))
	if err != nil {
		return nil, err
	}
	out := &storage.CubeIndex{Drafts: []storage.IndexedDraft{}}
	for _, draft := range all {
		decks, _, ok := readableDecks(draft)
		if !ok {
			continue
		}
		id := storage.IndexedDraft{DraftInfo: storage.NewDraftInfo(draft.DraftMetadata), HasLog: draft.HasLog()}
		for _, d := range decks {
			id.Decks = append(id.Decks, storage.IndexedDeck{ID: d.ID})
		}
		out.Drafts = append(out.Drafts, id)
	}
	return out, nil
}

// GetDraftLog returns a draft's raw log bytes, or ErrDeckNotFound if the draft
// doesn't exist or has no log.
func (b *Backend) GetDraftLog(cube string, draftID int) (json.RawMessage, error) {
	draft, err := findDraft(cube, draftID)
	if err != nil {
		return nil, err
	}
	contents, err := draft.Log()
	if errors.Is(err, drafts.ErrNotFound) {
		return nil, storage.ErrDeckNotFound
	}
	if err != nil {
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

// readableDecks loads a draft's decks for the cube-wide reads, logging and
// leaving out any deck file that won't load so one bad file doesn't hide the
// rest of its draft. The returned seat count includes the unreadable decks.
// The bool is false when the draft's directory can't be listed.
func readableDecks(draft drafts.Draft) ([]*types.Deck, int, bool) {
	logc := logrus.WithField("draft", draft.ID)
	decks, skipped, err := draft.ReadableDecks()
	if err != nil {
		logc.WithError(err).Warn("Failed to load draft decks")
		return nil, 0, false
	}
	for _, err := range skipped {
		logc.WithError(err).Warn("Skipping unreadable deck")
	}
	return decks, len(decks) + len(skipped), true
}
