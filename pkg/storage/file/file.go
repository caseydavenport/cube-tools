package file

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/caseydavenport/cube-tools/pkg/commands"
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
		info, err := draftInfo(draft.Path)
		if err != nil {
			logrus.WithError(err).WithField("draft", draft.Path).Warn("Failed to load draft metadata")
		}
		for _, deck := range draft.Decks {
			d, err := loadDeck(deck.Path)
			if err != nil {
				logrus.WithError(err).Warn("Failed to load deck")
				continue
			}
			d.DraftSize = len(draft.Decks)
			d.Draft = info
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

// LoadDraft returns every deck in the draft's directory, or ErrDeckNotFound if
// it holds none. It reads the directory rather than the cube index so a draft
// written since the last reindex is still editable.
func (b *Backend) LoadDraft(cube string, draftID int) ([]*storage.Deck, error) {
	files, err := loadDraftFiles(cube, draftID)
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, storage.ErrDeckNotFound
	}
	out := make([]*storage.Deck, 0, len(files))
	for _, f := range files {
		out = append(out, &storage.Deck{Deck: *f.deck})
	}
	return out, nil
}

// SaveDecks writes each deck back to the file in the draft's directory that
// holds its ID, so a renamed player keeps the same file. It returns
// ErrDeckNotFound for an ID no file in the draft has.
func (b *Backend) SaveDecks(cube string, draftID int, decks []*storage.Deck) error {
	files, err := loadDraftFiles(cube, draftID)
	if err != nil {
		return err
	}
	paths := make(map[int]string, len(files))
	for _, f := range files {
		paths[f.deck.ID] = f.path
	}
	for _, d := range decks {
		path, ok := paths[d.ID]
		if !ok {
			return storage.ErrDeckNotFound
		}
		td := d.Deck
		td.Metadata.Path = path
		if err := td.Save(path); err != nil {
			return fmt.Errorf("save deck %s: %w", path, err)
		}
	}
	return nil
}

// draftFile is one deck file in a draft directory, as loaded from disk.
type draftFile struct {
	path string
	deck *types.Deck
}

// loadDraftFiles loads every deck file in a draft's directory. It refuses a
// draft where a deck has no ID or two decks share one, since writes find their
// file by ID and would otherwise overwrite the wrong deck.
func loadDraftFiles(cube string, draftID int) ([]draftFile, error) {
	draft, err := findDraft(cube, draftID)
	if err != nil {
		return nil, err
	}
	paths, err := drafts.DeckFiles(draft.Dir)
	if err != nil {
		return nil, err
	}
	seen := make(map[int]string, len(paths))
	out := make([]draftFile, 0, len(paths))
	for _, path := range paths {
		d, err := types.LoadDeck(path)
		if err != nil {
			return nil, fmt.Errorf("load deck %s: %w", path, err)
		}
		if d.ID == 0 {
			return nil, fmt.Errorf("deck %s has no id", path)
		}
		if other, ok := seen[d.ID]; ok {
			return nil, fmt.Errorf("decks %s and %s share id %d", other, path, d.ID)
		}
		seen[d.ID] = path
		out = append(out, draftFile{path: path, deck: d})
	}
	return out, nil
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
		info, err := draftInfo(draft.Path)
		if err != nil {
			return nil, err
		}
		id := storage.IndexedDraft{DraftInfo: info, HasLog: draft.DraftLog != ""}
		for _, ideck := range draft.Decks {
			d, err := loadDeck(ideck.Path)
			if err != nil {
				logrus.WithError(err).Warn("Failed to load deck")
				continue
			}
			id.Decks = append(id.Decks, storage.IndexedDeck{ID: d.ID})
		}
		out.Drafts = append(out.Drafts, id)
	}
	return out, nil
}

// draftInfo reads the display fields from a draft directory's metadata.json.
func draftInfo(dir string) (storage.DraftInfo, error) {
	meta, err := types.LoadDraftMetadata(dir)
	if err != nil {
		return storage.DraftInfo{}, err
	}
	return storage.NewDraftInfo(*meta), nil
}

// GetDraftLog returns a draft's raw log bytes, or ErrDeckNotFound if the draft
// doesn't exist or has no log.
func (b *Backend) GetDraftLog(cube string, draftID int) (json.RawMessage, error) {
	draft, err := findDraft(cube, draftID)
	if err != nil {
		return nil, err
	}
	contents, err := os.ReadFile(filepath.Join(draft.Dir, "draft-log.json"))
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
