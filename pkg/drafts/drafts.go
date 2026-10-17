// Package drafts knows the layout of a draft directory: which files in it are
// decks, and how new decks are numbered.
package drafts

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

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
