package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var IndexCmd = &cobra.Command{
	Use:   "index",
	Short: "Regenerate index files for the drafts directory.",
	Run: func(cmd *cobra.Command, args []string) {
		index(cubeFlag)
	},
}

func init() {
	flags := IndexCmd.Flags()
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	_ = IndexCmd.MarkFlagRequired("cube")
}

type MainIndex struct {
	Drafts []Draft `json:"drafts"`
}

type Draft struct {
	Path     string        `json:"path"`
	Date     string        `json:"date"`
	DraftID  int           `json:"draft_id"`
	DraftLog string        `json:"draft_log"`
	Decks    []IndexedDeck `json:"decks"`
}

type IndexedDeck struct {
	Path string `json:"path"`
}

// index regenerates the index files for the given cube's drafts directory,
// fataling on error. See Index for the non-fatal equivalent used by the
// server.
func index(cube string) {
	if err := Index(cube); err != nil {
		logrus.WithError(err).Fatal("Failed to index drafts")
	}
}

// Index regenerates the index files for the given cube's drafts directory,
// listing drafts by date and then ID.
func Index(cube string) error {
	draftsDirectory := fmt.Sprintf("./data/%s", cube)
	if _, err := os.Stat(draftsDirectory); err != nil {
		return fmt.Errorf("read cube directory: %w", err)
	}
	all, err := drafts.List(draftsDirectory)
	if err != nil {
		return fmt.Errorf("list drafts: %w", err)
	}

	index := MainIndex{}
	for _, d := range all {
		draftLogPath := filepath.Join(d.Dir, "draft-log.json")
		if _, err := os.Stat(draftLogPath); os.IsNotExist(err) {
			draftLogPath = ""
		}
		index.Drafts = append(index.Drafts, Draft{
			Path:     d.Dir,
			DraftID:  d.ID,
			Date:     d.Date,
			DraftLog: draftLogPath,
			Decks:    decksInDraft(d.Dir),
		})
	}

	// Create the index file
	indexFile := filepath.Join(draftsDirectory, "index.json")

	// Create and open the file for writing
	file, err := os.Create(indexFile)
	if err != nil {
		return fmt.Errorf("create index file: %w", err)
	}
	defer file.Close()

	// Encode the directories to JSON
	fileData, err := json.MarshalIndent(index, "", " ")
	if err != nil {
		return fmt.Errorf("marshal directories to JSON: %w", err)
	}

	// Write the JSON data to the file
	if _, err := file.Write(fileData); err != nil {
		return fmt.Errorf("write JSON data to file: %w", err)
	}

	logrus.Debug("Finished indexing all drafts")
	return nil
}

// cubeCobraID returns the cube's Cube Cobra id from the registry, or "" if the
// registry is missing or the cube has no id set.
func cubeCobraID(cube string) string {
	reg, err := cubes.Load("data/cubes.json")
	if err != nil {
		logrus.WithError(err).Debug("No cube registry; skipping Cube Cobra enrichment")
		return ""
	}
	meta, ok := reg.Get(cube)
	if !ok {
		return ""
	}
	return meta.CubeCobraID
}

// decksInDraft returns a []Path pointing to all the decks in the given directory.
func decksInDraft(directory string) []IndexedDeck {
	files, err := drafts.DeckFiles(directory)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to get deck files")
	}
	var decks []IndexedDeck
	for _, file := range files {
		decks = append(decks, IndexedDeck{Path: file})
	}
	return decks
}
