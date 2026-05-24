package commands

import (
	"fmt"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

func DeckFilepath(cube, date, player string) string {
	return fmt.Sprintf("data/%s/%s/%s.json", cube, date, strings.ToLower(player))
}

func LoadParsedDeckFile(cube, date, player string) *types.Deck {
	filename := DeckFilepath(cube, date, player)
	d, err := types.LoadDeck(filename)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to load deck file")
	}
	return d
}

func SaveDeck(cube string, d *types.Deck) error {
	// Prefer the canonical path recorded in the deck's metadata so reparse
	// overwrites in place. Fall back to the conventional <draft>/<player>.json
	// location when no path is set (fresh parses).
	filename := d.Metadata.Path
	if filename == "" {
		filename = DeckFilepath(cube, d.Metadata.DraftID, d.Player)
	}
	return d.Save(filename)
}
