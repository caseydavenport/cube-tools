package commands

import (
	"encoding/json"
	"fmt"
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
			logrus.WithError(err).Fatal("Failed to reparse data files")
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
		return fmt.Errorf("failed to read index file: %w", err)
	}
	var index MainIndex
	if err := json.Unmarshal(contents, &index); err != nil {
		return fmt.Errorf("failed to unmarshal index file: %w", err)
	}

	// Iterate over the drafts and reparse each one.
	for _, draft := range index.Drafts {
		for _, deckIndex := range draft.Decks {
			// Open the deck file.
			deck, err := types.LoadDeck(deckIndex.Path)
			if err != nil {
				return fmt.Errorf("failed to load deck file %s: %w", deckIndex.Path, err)
			}

			// Build path to the .txt or csv file.
			srcFiles := deck.Metadata.GetSourceFiles()

			// Verify the source files exist.
			ok := true
			for _, srcFiles := range srcFiles {
				if _, err := os.Stat(srcFiles); os.IsNotExist(err) {
					logrus.WithField("deck", srcFiles).Warn("Deck file does not exist")
					ok = false
					break
				}
			}
			if !ok {
				continue
			}

			logrus.WithFields(logrus.Fields{
				"deck": deckIndex.Path,
				"src":  srcFiles,
			}).Info("Reparsing deck")

			if d, err := parseDeck(srcFiles, deck.Player, "", draft.Date, draft.DraftID); err != nil {
				logrus.WithError(err).WithField("deck", deckIndex.Path).Warn("Failed to parse deck")
			} else {
				// Write the updated deck file.
				if err := writeDeck(d, draft.DraftID); err != nil {
					logrus.WithError(err).Fatal("Failed to write deck")
				}
			}
		}
	}

	return nil
}
