package commands

import (
	"encoding/json"
	"fmt"
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
		index(cubeFlag)
	},
}

var indexCCCubeID string

func init() {
	flags := IndexCmd.Flags()
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	flags.StringVar(&indexCCCubeID, "cc-cube", "", "Cube Cobra cube id (shortId or UUID); when set, per-card draft Elo is fetched and merged into cube.json")
	_ = IndexCmd.MarkFlagRequired("cube")
}

type MainIndex struct {
	Drafts []Draft `json:"drafts"`
}

type Draft struct {
	Path     string        `json:"path"`
	Date     string        `json:"date"`
	DraftID  string        `json:"draft_id"`
	DraftLog string        `json:"draft_log"`
	Decks    []IndexedDeck `json:"decks"`
}

type IndexedDeck struct {
	Path string `json:"path"`
}

func index(cube string) {
	// Specify the draftsDirectory that holds the drafts.
	draftsDirectory := fmt.Sprintf("./data/%s", cube)

	// Get a list of sub-directories in the directory
	// each subdir represents a draft.
	draftIDs, err := getSubDirectories(draftsDirectory)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to get subdirectories")
		return
	}

	index := MainIndex{}

	// Iterate over the sub-directories and create maps
	for _, draftID := range draftIDs {
		// Determine if there is a draft log.
		draftLogPath := filepath.Join(draftsDirectory, draftID, "draft-log.json")
		if _, err := os.Stat(draftLogPath); os.IsNotExist(err) {
			draftLogPath = ""
		}

		// Construct the draft.
		draft := Draft{
			Path:     filepath.Join(draftsDirectory, draftID),
			DraftID:  draftID,
			Date:     dateFromDir(draftID),
			DraftLog: draftLogPath,
		}

		// Add decks to the draft.
		draft.Decks = decksInDraft(draft.Path)

		// Add this draft to the main index.
		index.Drafts = append(index.Drafts, draft)
	}

	// Create the index file
	indexFile := filepath.Join(draftsDirectory, "index.json")

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
	cards, _ := cardsFromCSV(fmt.Sprintf("data/%s/cube.csv", cube))
	if indexCCCubeID != "" {
		ccCards, err := fetchCubeCobraCards("https://cubecobra.com", indexCCCubeID)
		if err != nil {
			logrus.WithError(err).Warn("Failed to fetch Cube Cobra data; cube.json will omit draft Elo and printings")
		} else {
			matched := 0
			for i := range cards {
				info, ok := ccCards[cards[i].Name]
				if !ok {
					// Cube Cobra keys double-faced cards by their front-face name,
					// while our cube list uses the full "Front // Back" name. Retry
					// on the front face.
					if front, _, found := strings.Cut(cards[i].Name, " // "); found {
						info, ok = ccCards[strings.TrimSpace(front)]
					}
				}
				if !ok {
					continue
				}
				cards[i].DraftELO = info.elo

				// Prefer the printing the cube owner picked on Cube Cobra over
				// whatever printing our oracle bulk happens to carry.
				if info.image != "" {
					cards[i].Image = info.image
				}
				if info.url != "" {
					cards[i].URL = info.url
				}
				matched++
			}
			logrus.Infof("Merged Cube Cobra data for %d/%d cards", matched, len(cards))
		}
	}
	cubeData := types.Cube{Cards: cards}
	bytes, err := json.MarshalIndent(cubeData, "", " ")
	if err != nil {
		panic(err)
	}
	err = os.WriteFile(fmt.Sprintf("data/%s/cube.json", cube), bytes, os.ModePerm)
	if err != nil {
		panic(err)
	}

	logrus.Debug("Finished indexing all drafts")
}

// decksInDraft returns a []Path pointing to all the decks in the given directory.
func decksInDraft(directory string) []IndexedDeck {
	// Get a list of all JSON files in the directory
	jsonFiles, err := filepath.Glob(filepath.Join(directory, "*.json"))
	if err != nil {
		logrus.WithError(err).Fatal("Failed to get JSON files")
	}

	// Create a slice to store the maps
	var decks []IndexedDeck

	// Iterate over the JSON files and create maps
	for _, file := range jsonFiles {
		// Get only the base name of the file
		fileName := filepath.Base(file)

		// Skip dotfiles. Go's glob (unlike a shell) matches leading dots, so
		// *.json picks up the OCR import's .ocr-session.json working state.
		if strings.HasPrefix(fileName, ".") {
			continue
		}

		// Skip non-deck files in the draft directory.
		switch fileName {
		case "index.json", "metadata.json", "cube.json", "cube-rules.json",
			"cube-snapshot.json", "draft-log.json":
			continue
		}
		decks = append(decks, IndexedDeck{Path: file})
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
