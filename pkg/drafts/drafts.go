// Package drafts knows the layout of a cube's draft directories: how drafts
// are numbered and named, how to find one by ID, which files in a draft are
// decks, and how new decks are numbered.
package drafts

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// nonDeckFiles are the JSON files a draft directory holds besides its decks.
var nonDeckFiles = map[string]bool{
	"index.json":         true,
	"metadata.json":      true,
	"cube.json":          true,
	"cube-rules.json":    true,
	"cube-snapshot.json": true,
	"draft-log.json":     true,
}

// DeckFiles returns the paths of the deck files in a draft directory, sorted.
// Dotfiles (such as the OCR import's working state) and the draft's other JSON
// files are skipped. A missing directory has no decks.
func DeckFiles(dir string) ([]string, error) {
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
	sort.Strings(out)
	return out, nil
}

// NextDeckID returns the ID a new deck in the draft directory should get: one
// more than the highest ID among its existing decks, or 1 for an empty or
// missing directory. A gap left by a deleted deck stays unused, unless the
// deleted deck held the highest ID, which the next new deck takes.
func NextDeckID(dir string) (int, error) {
	files, err := DeckFiles(dir)
	if err != nil {
		return 0, err
	}
	highest := 0
	for _, path := range files {
		d, err := types.LoadDeck(path)
		if err != nil {
			return 0, fmt.Errorf("load deck %s: %w", path, err)
		}
		highest = max(highest, d.ID)
	}
	return highest + 1, nil
}

// ErrNotFound is returned when no draft or deck has the requested ID.
var ErrNotFound = errors.New("draft not found")

// Draft is a draft's metadata together with the directory it lives in.
type Draft struct {
	types.DraftMetadata
	Dir string
}

// DirName returns the directory name for a draft: its zero-padded ID, then its
// date, so a directory listing sorts in ID order.
func DirName(id int, date string) string {
	return fmt.Sprintf("%04d_%s", id, date)
}

// List returns every draft under cubeDir, sorted by date and then ID. A
// subdirectory counts as a draft only if its metadata.json has an ID; a
// missing cubeDir has no drafts.
func List(cubeDir string) ([]Draft, error) {
	entries, err := os.ReadDir(cubeDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("list drafts in %s: %w", cubeDir, err)
	}
	var out []Draft
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(cubeDir, e.Name())
		meta, err := types.LoadDraftMetadata(dir)
		if err != nil {
			return nil, fmt.Errorf("load draft metadata in %s: %w", dir, err)
		}
		if meta.ID == 0 {
			continue
		}
		out = append(out, Draft{Dir: dir, DraftMetadata: *meta})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Date != out[j].Date {
			return out[i].Date < out[j].Date
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

// Find returns the draft under cubeDir with the given ID, or ErrNotFound.
func Find(cubeDir string, id int) (Draft, error) {
	all, err := List(cubeDir)
	if err != nil {
		return Draft{}, err
	}
	for _, d := range all {
		if d.ID == id {
			return d, nil
		}
	}
	return Draft{}, ErrNotFound
}

// Create makes a new draft under cubeDir from meta, which must have a Date. It
// assigns the next unused ID, creates the draft's directory, and writes its
// metadata.json. It refuses to reuse a directory that already exists.
func Create(cubeDir string, meta types.DraftMetadata) (Draft, error) {
	if meta.Date == "" {
		return Draft{}, errors.New("a new draft needs a date")
	}

	// The date becomes part of the directory name, so it must be exactly
	// YYYY-MM-DD and nothing that could reach outside cubeDir.
	if _, err := time.Parse(time.DateOnly, meta.Date); err != nil {
		return Draft{}, fmt.Errorf("draft date %q must be YYYY-MM-DD", meta.Date)
	}
	all, err := List(cubeDir)
	if err != nil {
		return Draft{}, err
	}
	meta.ID = 1
	for _, d := range all {
		meta.ID = max(meta.ID, d.ID+1)
	}
	dir := filepath.Join(cubeDir, DirName(meta.ID, meta.Date))
	if err := os.MkdirAll(cubeDir, 0o755); err != nil {
		return Draft{}, err
	}
	if err := os.Mkdir(dir, 0o755); err != nil {
		return Draft{}, fmt.Errorf("create draft directory: %w", err)
	}
	if err := meta.Save(dir); err != nil {
		return Draft{}, fmt.Errorf("write draft metadata: %w", err)
	}
	return Draft{Dir: dir, DraftMetadata: meta}, nil
}

// DeckPath returns where a new deck with the given ID is written in a draft.
func DeckPath(draftDir string, deckID int) string {
	return filepath.Join(draftDir, fmt.Sprintf("%d.json", deckID))
}

// LoadDeck finds the deck with the given ID among a draft's deck files and
// returns it with its path, or ErrNotFound. Older decks may live in files not
// named for their ID, so this reads the files rather than trusting DeckPath.
func LoadDeck(draftDir string, deckID int) (*types.Deck, string, error) {
	files, err := DeckFiles(draftDir)
	if err != nil {
		return nil, "", err
	}
	for _, path := range files {
		d, err := types.LoadDeck(path)
		if err != nil {
			return nil, "", fmt.Errorf("load deck %s: %w", path, err)
		}
		if d.ID == deckID {
			return d, path, nil
		}
	}
	return nil, "", ErrNotFound
}

// FindDeckByPlayer finds the deck in a draft played by the named player,
// ignoring case, and returns it with its path, or ErrNotFound.
func FindDeckByPlayer(draftDir, player string) (*types.Deck, string, error) {
	files, err := DeckFiles(draftDir)
	if err != nil {
		return nil, "", err
	}
	for _, path := range files {
		d, err := types.LoadDeck(path)
		if err != nil {
			return nil, "", fmt.Errorf("load deck %s: %w", path, err)
		}
		if strings.EqualFold(d.Player, player) {
			return d, path, nil
		}
	}
	return nil, "", ErrNotFound
}
