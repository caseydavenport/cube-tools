package drafts

import (
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// nonDeckFiles are the JSON files a draft directory holds besides its decks.
var nonDeckFiles = map[string]bool{
	"index.json":         true,
	metadataFile:         true,
	"cube.json":          true,
	"cube-rules.json":    true,
	"cube-snapshot.json": true,
	"draft-log.json":     true,
}

// deckFiles returns the paths of the deck files in a draft directory, in
// natural order so deck 10 follows deck 9. Dotfiles (such as the OCR import's
// working state) and the draft's other JSON files are skipped. A missing
// directory has no decks.
func deckFiles(dir string) ([]string, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, fmt.Errorf("list deck files in %s: %w", dir, err)
	}
	var out []string
	for _, path := range matches {
		name := filepath.Base(path)
		if strings.HasPrefix(name, ".") || nonDeckFiles[name] {
			continue
		}
		out = append(out, path)
	}
	sort.Slice(out, func(i, j int) bool {
		return NaturalLess(filepath.Base(out[i]), filepath.Base(out[j]))
	})
	return out, nil
}

// deckPath returns where a new deck with the given ID is written in a draft.
func deckPath(dir string, id int) string {
	return filepath.Join(dir, fmt.Sprintf("%d.json", id))
}

// Decks returns every deck in the draft, in deck-file order, with display
// names unresolved and each deck's stored path set to the file it came from.
// It errors on a deck file that won't load.
func (d Draft) Decks() ([]*types.Deck, error) {
	files, err := deckFiles(d.Dir)
	if err != nil {
		return nil, err
	}
	decks := make([]*types.Deck, 0, len(files))
	for _, path := range files {
		deck, err := types.LoadDeck(path)
		if err != nil {
			return nil, fmt.Errorf("load deck %s: %w", path, err)
		}
		deck.Metadata.Path = path
		decks = append(decks, deck)
	}
	return decks, nil
}

// Deck returns the deck with the given ID, or ErrNotFound. Older decks may
// live in files not named for their ID, so this reads the files rather than
// trusting the name.
func (d Draft) Deck(id int) (*types.Deck, error) {
	return d.findDeck(func(deck *types.Deck) bool { return deck.ID == id })
}

// DeckByPlayer returns the deck played by the given player, or ErrNotFound.
// An anonymous seat (player 0) never matches.
func (d Draft) DeckByPlayer(playerID int) (*types.Deck, error) {
	if playerID == 0 {
		return nil, ErrNotFound
	}
	return d.findDeck(func(deck *types.Deck) bool { return deck.PlayerID == playerID })
}

// findDeck returns the first deck that matches, or ErrNotFound.
func (d Draft) findDeck(match func(*types.Deck) bool) (*types.Deck, error) {
	decks, err := d.Decks()
	if err != nil {
		return nil, err
	}
	for _, deck := range decks {
		if match(deck) {
			return deck, nil
		}
	}
	return nil, ErrNotFound
}

// NextDeckID returns the ID a new deck in the draft should get: one more than
// the highest ID among its existing decks, or 1 for an empty or missing
// directory. A gap left by a deleted deck stays unused, unless the deleted
// deck held the highest ID, which the next new deck takes.
func (d Draft) NextDeckID() (int, error) {
	decks, err := d.Decks()
	if err != nil {
		return 0, err
	}
	highest := 0
	for _, deck := range decks {
		highest = max(highest, deck.ID)
	}
	return highest + 1, nil
}

// SaveDeck writes deck into the draft: over the file that already holds its
// ID, or to a new file named for the ID. It sets the deck's stored path and
// draft ID first. It refuses a draft where a deck file has no ID or two share
// this one, since it couldn't tell which file to overwrite.
func (d Draft) SaveDeck(deck *types.Deck) error {
	if deck.ID == 0 {
		return errors.New("a deck needs an ID to be saved")
	}
	byID, err := d.filesByID()
	if err != nil {
		return err
	}
	path := deckPath(d.Dir, deck.ID)
	switch holders := byID[deck.ID]; len(holders) {
	case 0:
	case 1:
		path = holders[0]
	default:
		return duplicateIDError(deck.ID, holders)
	}
	deck.Metadata.Path = path
	deck.Metadata.DraftID = d.ID
	return deck.Save(path)
}

// CheckDeckIDs returns an error naming the files when a deck file in the
// draft has no ID or two share one. Callers that edit decks by ID check first,
// so an edit can't land on the wrong file.
func (d Draft) CheckDeckIDs() error {
	byID, err := d.filesByID()
	if err != nil {
		return err
	}
	ids := make([]int, 0, len(byID))
	for id := range byID {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, id := range ids {
		if len(byID[id]) > 1 {
			return duplicateIDError(id, byID[id])
		}
	}
	return nil
}

// filesByID maps each deck ID in the draft to the files holding it. It errors
// on a deck file with no ID.
func (d Draft) filesByID() (map[int][]string, error) {
	files, err := deckFiles(d.Dir)
	if err != nil {
		return nil, err
	}
	byID := make(map[int][]string, len(files))
	for _, path := range files {
		deck, err := types.LoadDeck(path)
		if err != nil {
			return nil, fmt.Errorf("load deck %s: %w", path, err)
		}
		if deck.ID == 0 {
			return nil, fmt.Errorf("deck file %s has no id", path)
		}
		byID[deck.ID] = append(byID[deck.ID], path)
	}
	return byID, nil
}

// duplicateIDError reports a deck ID held by more than one file.
func duplicateIDError(id int, paths []string) error {
	return fmt.Errorf("deck id %d is used by more than one file: %s", id, strings.Join(paths, ", "))
}

// NaturalLess orders strings so runs of digits compare as numbers: "p2" sorts
// before "p10" and "photo9.jpg" before "photo10.jpg". Everything else compares
// byte by byte.
func NaturalLess(a, b string) bool {
	for a != "" && b != "" {
		if isDigit(a[0]) && isDigit(b[0]) {
			na, restA := digitRun(a)
			nb, restB := digitRun(b)
			if na != nb {
				return numLess(na, nb)
			}
			a, b = restA, restB
			continue
		}
		if a[0] != b[0] {
			return a[0] < b[0]
		}
		a, b = a[1:], b[1:]
	}
	return len(a) < len(b)
}

// isDigit reports whether c is an ASCII digit.
func isDigit(c byte) bool {
	return c >= '0' && c <= '9'
}

// digitRun splits s into its leading digits, with leading zeros dropped, and
// the rest.
func digitRun(s string) (string, string) {
	i := 0
	for i < len(s) && isDigit(s[i]) {
		i++
	}
	return strings.TrimLeft(s[:i], "0"), s[i:]
}

// numLess compares two digit strings without leading zeros as numbers.
func numLess(a, b string) bool {
	if len(a) != len(b) {
		return len(a) < len(b)
	}
	return a < b
}
