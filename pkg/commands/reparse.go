package commands

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ReparseCmd parses every deck of a cube again from its saved source files,
// to pick up changes to the parser or the oracle data.
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
	flag.MarkRequired(ReparseCmd, "cube")
}

// reparse parses each deck of each draft of cube again and overwrites it in
// place. A deck whose source files are missing, or whose files fail to parse, is
// skipped with a warning.
func reparse(cube string) error {
	all, err := drafts.List(filepath.Join("data", cube))
	if err != nil {
		return fmt.Errorf("failed to list drafts: %w", err)
	}

	for _, draft := range all {
		decks, err := draft.Decks()
		if err != nil {
			return err
		}
		for _, deck := range decks {
			if err := reparseDeck(draft, deck); err != nil {
				return err
			}
		}
	}
	return nil
}

// reparseDeck parses the deck's source files again and writes the result over
// the deck, keeping its ID.
func reparseDeck(draft drafts.Draft, deck *types.Deck) error {
	sourceFiles := deck.Metadata.GetSourceFiles()
	for _, sourceFile := range sourceFiles {
		if _, err := os.Stat(sourceFile); os.IsNotExist(err) {
			logrus.WithField("file", sourceFile).Warn("Deck file does not exist")
			return nil
		}
	}

	logrus.WithFields(logrus.Fields{
		"deck": deck.ID,
		"src":  sourceFiles,
	}).Info("Reparsing deck")

	parsed, err := parseDeck(sourceFiles, deck.PlayerID, "", draft.Date, draft.ID)
	if err != nil {
		logrus.WithError(err).WithField("deck", deck.ID).Warn("Failed to parse deck")
		return nil
	}
	parsed.ID = deck.ID
	if err := writeDeck(parsed, draft); err != nil {
		return fmt.Errorf("write deck %d: %w", deck.ID, err)
	}
	return nil
}
