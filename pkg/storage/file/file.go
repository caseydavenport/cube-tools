package file

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/caseydavenport/cube-tools/pkg/commands"
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
func (b *Backend) WriteDeckMeta(cube, draftID, deckID, macroArchetype string, labels, colors []string) (*storage.Deck, error) {
	path, err := b.deckFilePath(cube, draftID, deckID)
	if err != nil {
		return nil, err
	}
	d, err := types.LoadDeck(path)
	if err != nil {
		return nil, err
	}
	d.MacroArchetype = macroArchetype
	d.Labels = labels
	d.Colors = colors
	if err := d.Save(path); err != nil {
		return nil, err
	}
	return &storage.Deck{Deck: *d}, nil
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
