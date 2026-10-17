package commands

import (
	"errors"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// SaveDeck writes a deck to the file recorded in its metadata, so callers
// that loaded a deck from disk overwrite it in place.
func SaveDeck(d *types.Deck) error {
	if d.Metadata.Path == "" {
		return errors.New("deck has no path to save to")
	}
	return d.Save(d.Metadata.Path)
}
