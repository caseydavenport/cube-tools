package commands

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var (
	hedronCubeID string
	hedronDraftID string
)

var ImportHedronCmd = &cobra.Command{
	Use:   "import-hedron",
	Short: "Import a draft from Hedron Network",
	Run: func(cmd *cobra.Command, args []string) {
		if hedronCubeID == "" {
			logrus.Fatal("Must specify a CubeCobra ID or URL (--cube)")
		}

		drafts, err := fetchHedronDrafts(hedronCubeID)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to fetch drafts from Hedron")
		}

		if len(drafts) == 0 {
			logrus.Fatal("No drafts found for this cube on Hedron")
		}

		var selectedDraft *HedronDraft
		if hedronDraftID != "" {
			for _, d := range drafts {
				if d.DraftID == hedronDraftID {
					selectedDraft = &d
					break
				}
			}
			if selectedDraft == nil {
				logrus.Fatalf("Draft ID %s not found in search results", hedronDraftID)
			}
		} else {
			fmt.Println("Available drafts:")
			for i, d := range drafts {
				fmt.Printf("[%d] %s - %s (%d players)\n", i, d.Date[:10], d.EventName, len(d.Players))
			}
			fmt.Print("Select a draft index to import: ")
			var index int
			_, err := fmt.Scanln(&index)
			if err != nil || index < 0 || index >= len(drafts) {
				logrus.Fatal("Invalid selection")
			}
			selectedDraft = &drafts[index]
		}

		importDraft(selectedDraft)
		
		// Regenerate index.
		index()
	},
}

func init() {
	flags := ImportHedronCmd.Flags()
	flags.StringVarP(&hedronCubeID, "cube", "c", "", "CubeCobra ID or URL")
	flags.StringVarP(&hedronDraftID, "draft", "d", "", "Specific Hedron Draft ID to import")
}

type HedronSearchResponse struct {
	Drafts []HedronDraft `json:"drafts"`
}

type HedronDraft struct {
	DraftID   string         `json:"draftId"`
	EventCode string         `json:"eventCode"`
	EventName string         `json:"eventName"`
	FlightName string        `json:"flightName"`
	Date      string         `json:"date"`
	Players   []HedronPlayer `json:"players"`
	Matches   []HedronMatch  `json:"matches"`
}

type HedronPlayer struct {
	ID     string `json:"id"`
	Record string `json:"record"`
	Images struct {
		Deck []struct {
			URL string `json:"url"`
		} `json:"deck"`
	} `json:"images"`
}

type HedronMatch struct {
	Round     int    `json:"round"`
	Player1ID string `json:"player1Id"`
	Player2ID string `json:"player2Id"`
	Result    []int  `json:"result"`
	IsBye     bool   `json:"isBye"`
}

func fetchHedronDrafts(cubeID string) ([]HedronDraft, error) {
	resp, err := http.Get(fmt.Sprintf("https://hedron.network/cube-results/search?cubeId=%s", cubeID))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP error: %d", resp.StatusCode)
	}

	var searchResp HedronSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, err
	}

	return searchResp.Drafts, nil
}

func sanitizePlayerName(playerID, draftID string) string {
	// Combine player ID and short draft ID for a globally unique ID.
	// We use the first 8 chars of the draft UUID.
	shortID := draftID
	if len(shortID) > 8 {
		shortID = shortID[:8]
	}
	name := fmt.Sprintf("%s_%s", playerID, shortID)
	return strings.ReplaceAll(strings.ToLower(name), " ", "")
}

func importDraft(d *HedronDraft) {
	// Hedron date is ISO format, cube-tools wants YYYY-MM-DD.
	dateStr := d.Date[:10]
	// Use draft ID as sub-directory name, but sanitized. 
	// Include the short draft ID to ensure uniqueness.
	shortID := d.DraftID
	if len(shortID) > 8 {
		shortID = shortID[:8]
	}
	draftDirName := fmt.Sprintf("%s_%s_%s", dateStr, d.EventCode, shortID)
	outdir := filepath.Join("data", "polyverse", draftDirName)
	imgdir := filepath.Join(outdir, "img")

	// Error if the directory already exists to prevent accidental overwrites.
	if _, err := os.Stat(outdir); !os.IsNotExist(err) {
		logrus.Fatalf("Directory %s already exists. Please remove it before importing.", outdir)
	}

	if err := os.MkdirAll(imgdir, os.ModePerm); err != nil {
		logrus.WithError(err).Fatal("Failed to create directories")
	}

	// For each player, create a deck.
	playerDecks := make(map[string]*types.Deck)

	for _, p := range d.Players {
		deck := types.NewDeck()
		deck.Player = sanitizePlayerName(p.ID, d.DraftID)
		deck.Date = dateStr
		deck.Metadata.DraftID = draftDirName
		
		// If they have a deck photo, download it.
		if len(p.Images.Deck) > 0 {
			imageURL := "https://hedron.network" + p.Images.Deck[0].URL
			imageFilename := fmt.Sprintf("%s.jpg", deck.Player)
			imagePath := filepath.Join(imgdir, imageFilename)
			
			logrus.Infof("Downloading deck photo for %s...", p.ID)
			if err := downloadFile(imageURL, imagePath); err != nil {
				logrus.WithError(err).Warnf("Failed to download image for %s", p.ID)
			} else {
				deck.DeckImage = filepath.Join("img", imageFilename)
			}
		}
		
		playerDecks[p.ID] = deck
	}

	// Add matches to each deck.
	for _, m := range d.Matches {
		if m.IsBye {
			continue
		}
		
		p1Deck, ok1 := playerDecks[m.Player1ID]
		p2Deck, ok2 := playerDecks[m.Player2ID]
		
		if !ok1 || !ok2 {
			continue
		}

		winner := ""
		if m.Result[0] > m.Result[1] {
			winner = p1Deck.Player
		} else if m.Result[1] > m.Result[0] {
			winner = p2Deck.Player
		}
		
		p1Deck.AddMatch(p2Deck.Player, winner)
		p2Deck.AddMatch(p1Deck.Player, winner)
	}

	// Save all decks.
	for _, deck := range playerDecks {
		filename := filepath.Join(outdir, fmt.Sprintf("%s.json", deck.Player))
		deck.Metadata.Path = filename
		
		bs, err := json.MarshalIndent(deck, "", " ")
		if err != nil {
			logrus.WithError(err).Fatal("Failed to marshal deck")
		}
		
		if err := os.WriteFile(filename, bs, os.ModePerm); err != nil {
			logrus.WithError(err).Fatal("Failed to write deck file")
		}
		logrus.Infof("Saved deck for %s", deck.Player)
	}
}

func downloadFile(url, path string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP error: %d", resp.StatusCode)
	}

	out, err := os.Create(path)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}
