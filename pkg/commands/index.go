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

func index() {
	// Specify the directory that holds the drafts.
	directory := "./drafts"

	// Get a list of sub-directories in the directory
	// each subdir represents a draft.
	subDirs, err := getSubDirectories(directory)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to get subdirectories")
		return
	}

	// Create a slice to store the maps
	var dirs []map[string]string

	// Iterate over the sub-directories and create maps
	for _, dir := range subDirs {
		// Create a map with "name" as the key and the directory name as the value
		dirMap := map[string]string{"name": dir}
		dirs = append(dirs, dirMap)
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
	fileData, err := json.MarshalIndent(dirs, "", " ")
	if err != nil {
		logrus.WithError(err).Fatal("Failed to marshal directories to JSON")
	}

	// Write the JSON data to the file
	_, err = file.Write(fileData)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to write JSON data to file")
	}

	// For each draft, we should also index the decks within it.
	for _, draft := range dirs {
		indexDraft("drafts/" + draft["name"])
	}

	// As part of re-indexing, parse the cube.csv and convert it to json so
	// that it's more easily read by the UI code.
	cards, _ := cardsFromCSV("cube.csv")
	cube := types.Cube{Cards: cards}
	bytes, err := json.MarshalIndent(cube, "", " ")
	if err != nil {
		panic(err)
	}
	err = os.WriteFile("cube.json", bytes, os.ModePerm)
	if err != nil {
		panic(err)
	}

	logrus.Debug("Finished indexing all drafts")
}

func indexDraft(directory string) {
	// Get a list of all JSON files in the directory
	jsonFiles, err := filepath.Glob(filepath.Join(directory, "*.json"))
	if err != nil {
		logrus.WithError(err).Fatal("Failed to get JSON files")
	}

	// Create a slice to store the maps
	var decks []map[string]string

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

		// Create a map with "deck" as the key and the file name as the value
		deck := map[string]string{
			"deck": fileName,
		}

		decks = append(decks, deck)
	}

	// Create the index file
	indexFile := filepath.Join(directory, "index.json")

	// Create and open the file for writing
	file, err := os.Create(indexFile)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to create index file")
	}
	defer file.Close()

	// Encode the decks to JSON
	fileData, err := json.MarshalIndent(decks, "", " ")
	if err != nil {
		logrus.WithError(err).Fatal("Failed to marshal decks to JSON")
	}

	// Write the JSON data to the file
	_, err = file.Write(fileData)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to write JSON data to file")
	}

	logrus.WithField("directory", directory).Info("Wrote index file")
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
