package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

func DeckFilepath(date, player string) string {
	return fmt.Sprintf("data/polyverse/%s/%s.json", date, strings.ToLower(player))
}

func LoadParsedDeckFile(date, player string) *types.Deck {
	filename := DeckFilepath(date, player)
	d, err := types.LoadDeck(filename)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to load deck file")
	}
	return d
}

func SaveDeck(d *types.Deck) error {
	bs, err := json.MarshalIndent(d, "", " ")
	if err != nil {
		return err
	}

	// Write the parsed deck.
	fn := DeckFilepath(d.Metadata.DraftID, d.Player)
	err = os.WriteFile(fn, bs, os.ModePerm)
	if err != nil {
		return err
	}
	return nil
}
