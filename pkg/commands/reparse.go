package commands

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// Define a cobra command for parsing a single deck file.
var ReparseCmd = &cobra.Command{
	Use:   "reparse",
	Short: "Reparse existing data files to update them",
	Run: func(cmd *cobra.Command, args []string) {
		if err := reparse(cubeFlag); err != nil {
			logrus.WithError(err).Fatal("Failed to reparse data files")
		}
	},
}

func init() {
	flags := ReparseCmd.Flags()
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	_ = ReparseCmd.MarkFlagRequired("cube")
}

func reparse(cube string) error {
	all, err := drafts.List(filepath.Join("data", cube))
	if err != nil {
		return fmt.Errorf("failed to list drafts: %w", err)
	}

	// Iterate over the drafts and reparse each one.
	for _, draft := range all {
		paths, err := drafts.DeckFiles(draft.Dir)
		if err != nil {
			return err
		}
		for _, deckPath := range paths {
			// Open the deck file.
			deck, err := types.LoadDeck(deckPath)
			if err != nil {
				return fmt.Errorf("failed to load deck file %s: %w", deckPath, err)
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
				"deck": deckPath,
				"src":  srcFiles,
			}).Info("Reparsing deck")

			if d, err := parseDeck(srcFiles, deck.PlayerID, "", draft.Date, draft.ID); err != nil {
				logrus.WithError(err).WithField("deck", deckPath).Warn("Failed to parse deck")
			} else {
				// Preserve the existing path so reparse overwrites the deck in
				// place.
				d.Metadata.Path = deck.Metadata.Path
				if err := writeDeck(d, draft); err != nil {
					logrus.WithError(err).Fatal("Failed to write deck")
				}
			}
		}
	}

	return nil
}
