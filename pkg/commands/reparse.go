package commands

import (
	"encoding/json"
	"os"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// Define a cobra command for parsing a single deck file.
var ReparseCmd = &cobra.Command{
	Use:   "reparse",
	Short: "Reparse existing data files to update them",
	Run: func(cmd *cobra.Command, args []string) {
		if err := reparse(); err != nil {
			logrus.Fatal(err)
		}
	},
}

func init() {
}

func reparse() error {
	// Get the list of drafts to reparse by loading the Index file.
	indexFile := "data/polyverse/index.json"
	contents, err := os.ReadFile(indexFile)
	if err != nil {
		return err
	}
	var index MainIndex
	if err := json.Unmarshal(contents, &index); err != nil {
		return err
	}

	// Iterate over the drafts and reparse each one.
	for _, draft := range index.Drafts {
		for _, deckIndex := range draft.Decks {
			// Open the deck file.
			deck, err := types.LoadDeck(deckIndex.Path)
			if err != nil {
				return err
			}

			// Build path to the .txt or csv file.
			srcFile := deck.Metadata.GetSourceFile()
			if _, err := os.Stat(srcFile); os.IsNotExist(err) {
				logrus.WithField("deck", srcFile).Warn("Deck file does not exist")
				continue
			}

			if err := parseSingleDeck(srcFile, deck.Player, "", draft.Date, draft.DraftID); err != nil {
				logrus.WithError(err).WithField("deck", deckIndex.Path).Warn("Failed to parse deck")
			}
		}
	}

	return nil
}
