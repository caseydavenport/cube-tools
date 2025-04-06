package commands

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var IndexCmd = &cobra.Command{
	Use:   "index",
	Short: "Regenerate index files for the drafts directory.",
	Run: func(cmd *cobra.Command, args []string) {
		index()
	},
}

type MainIndex struct {
	Drafts []Draft `json:"drafts"`
}

type Draft struct {
	Dir      string `json:"dir"`
	Date     string `json:"date"`
	DraftLog string `json:"draft_log"`
	Decks    []Path `json:"decks"`
}

type Path struct {
	Path string `json:"path"`
}

func index() {
	// Specify the directory that holds the drafts.
	directory := "./data/polyverse"

	// Get a list of sub-directories in the directory
	// each subdir represents a draft.
	subDirs, err := getSubDirectories(directory)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to get subdirectories")
		return
	}

	index := MainIndex{}

	// Iterate over the sub-directories and create maps
	for _, dir := range subDirs {
		// Determine if there is a draft log.
		draftLogPath := filepath.Join(directory, dir, "draft-log.json")
		if _, err := os.Stat(draftLogPath); os.IsNotExist(err) {
			draftLogPath = ""
		}

		// Construct the draft.
		draft := Draft{
			Dir:      dir,
			Date:     dateFromDir(dir),
			DraftLog: draftLogPath,
		}

		// Add decks to the draft.
		draft.Decks = decksInDraft("data/polyverse/" + draft.Date)

		// Add this draft to the main index.
		index.Drafts = append(index.Drafts, draft)
	}

	// Create the index file
	indexFile := filepath.Join(directory, "index.json")

	// Create and open the file for writing
	file, err := os.Create(indexFile)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to create index file")
	}
	defer file.Close()

	// Encode the directories to JSON
	fileData, err := json.MarshalIndent(index, "", " ")
	if err != nil {
		logrus.WithError(err).Fatal("Failed to marshal directories to JSON")
	}

	// Write the JSON data to the file
	_, err = file.Write(fileData)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to write JSON data to file")
	}

	// As part of re-indexing, parse the cube.csv and convert it to json so
	// that it's more easily read by the UI code.
	cards, _ := cardsFromCSV("data/polyverse/cube.csv")
	cube := types.Cube{Cards: cards}
	bytes, err := json.MarshalIndent(cube, "", " ")
	if err != nil {
		panic(err)
	}
	err = os.WriteFile("data/polyverse/cube.json", bytes, os.ModePerm)
	if err != nil {
		panic(err)
	}

	logrus.Debug("Finished indexing all drafts")
}

// decksInDraft returns a []Path pointing to all the decks in the given directory.
func decksInDraft(directory string) []Path {
	// Get a list of all JSON files in the directory
	jsonFiles, err := filepath.Glob(filepath.Join(directory, "*.json"))
	if err != nil {
		logrus.WithError(err).Fatal("Failed to get JSON files")
	}

	// Create a slice to store the maps
	var decks []Path

	// Iterate over the JSON files and create maps
	for _, file := range jsonFiles {
		// Get only the base name of the file
		fileName := filepath.Base(file)

		// Skip index.json and cube snapshot files.
		if fileName == "index.json" {
			continue
		}
		if strings.Contains(file, "snapshot") {
			continue
		}
		if strings.Contains(file, "draft-log") {
			continue
		}
		decks = append(decks, Path{Path: file})
	}
	return decks
}

// getSubDirectories returns a list of sub-directories in the given directory
func getSubDirectories(directory string) ([]string, error) {
	// Read the directory content
	files, err := os.ReadDir(directory)
	if err != nil {
		return nil, err
	}

	// Create a slice to store the sub-directory names
	var subDirs []string

	// Iterate over the directory content
	for _, file := range files {
		if file.IsDir() {
			subDirs = append(subDirs, file.Name())
		}
	}

	return subDirs, nil
}

func dateFromDir(dir string) string {
	// Split the directory name by underscores. Draft directories can have a suffix,
	// which we need to strip.
	return strings.Split(dir, "_")[0]
}
