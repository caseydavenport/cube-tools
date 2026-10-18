package commands

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var (
	hedronCubeID  string
	hedronDraftID string
	hedronOutCube string
)

var ImportHedronCmd = &cobra.Command{
	Use:   "import-hedron",
	Short: "Import a draft from Hedron Network",
	Run: func(cmd *cobra.Command, args []string) {
		if hedronCubeID == "" {
			logrus.Fatal("Must specify a CubeCobra ID or URL (--cube)")
		}

		hedronDrafts, err := fetchHedronDrafts(hedronCubeID)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to fetch drafts from Hedron")
		}

		if len(hedronDrafts) == 0 {
			logrus.Fatal("No drafts found for this cube on Hedron")
		}

		var selectedDraft *HedronDraft
		if hedronDraftID != "" {
			for _, d := range hedronDrafts {
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
			for i, d := range hedronDrafts {
				fmt.Printf("[%d] %s - %s / %s (%d players)\n", i, d.Date[:10], d.EventName, d.FlightName, len(d.Players))
			}
			fmt.Print("Select a draft index to import: ")
			var index int
			_, err := fmt.Scanln(&index)
			if err != nil || index < 0 || index >= len(hedronDrafts) {
				logrus.Fatal("Invalid selection")
			}
			selectedDraft = &hedronDrafts[index]
		}

		localID, err := ImportHedronDraft(hedronOutCube, hedronCubeID, selectedDraft.DraftID)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to import Hedron draft")
		}
		logrus.WithField("draft", localID).Info("Imported Hedron draft")
	},
}

func init() {
	flags := ImportHedronCmd.Flags()
	flags.StringVarP(&hedronCubeID, "cube", "c", "", "CubeCobra ID or URL")
	flags.StringVarP(&hedronDraftID, "draft", "d", "", "Specific Hedron Draft ID to import")
	flags.StringVar(&hedronOutCube, "out-cube", "", "cube id to write imported data into (required)")
	_ = ImportHedronCmd.MarkFlagRequired("out-cube")
}

type HedronSearchResponse struct {
	Drafts []HedronDraft `json:"drafts"`
}

type HedronDraft struct {
	DraftID    string         `json:"draftId"`
	EventCode  string         `json:"eventCode"`
	EventName  string         `json:"eventName"`
	FlightName string         `json:"flightName"`
	Date       string         `json:"date"`
	Players    []HedronPlayer `json:"players"`
	Matches    []HedronMatch  `json:"matches"`
}

type HedronImageRef struct {
	URL string `json:"url"`
}

type HedronPlayer struct {
	ID     string `json:"id"`
	Record string `json:"record"`
	Images struct {
		Checkin  []HedronImageRef `json:"checkin"`
		Checkout []HedronImageRef `json:"checkout"`
		Deck     []HedronImageRef `json:"deck"`
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

// hedronPlayerNum returns the 1-indexed player number from a Hedron player
// ID like "Player 8". Returns 0 if it doesn't fit the expected shape.
func hedronPlayerNum(playerID string) int {
	n := 0
	if _, err := fmt.Sscanf(playerID, "Player %d", &n); err != nil {
		return 0
	}
	return n
}

// importDraft writes a Hedron draft into a new numbered draft of cube: one
// anonymous deck per player, with ID N for Hedron's "Player N", their
// downloaded photos under img/pN/, and both sides of every match. It returns
// the new draft's ID.
func importDraft(cube string, d *HedronDraft) (int, error) {
	dateStr := d.Date[:10]
	cubeDir := filepath.Join("data", cube)

	// The description names the event and flight, so with the date it marks a
	// Hedron draft as already imported, including imports from before numbering.
	desc := fmt.Sprintf("Imported from Hedron Network. Event Code: %s, Flight: %s", d.EventCode, d.FlightName)
	existing, err := drafts.List(cubeDir)
	if err != nil {
		return 0, err
	}
	for _, e := range existing {
		if e.Date == dateStr && e.EventDescription == desc {
			return 0, fmt.Errorf("already imported as draft %d", e.ID)
		}
	}
	draft, err := drafts.Create(cubeDir, types.DraftMetadata{
		Date:             dateStr,
		EventName:        d.EventName,
		EventCode:        d.EventCode,
		EventDescription: desc,
		Flight:           d.FlightName,
	})
	if err != nil {
		return 0, err
	}
	imgdir := filepath.Join(draft.Dir, "img")

	// Number players by Hedron's "Player N", giving any that don't fit that
	// shape the next free numbers.
	playerNumbers := map[string]int{}
	highest := 0
	for _, p := range d.Players {
		if n := hedronPlayerNum(p.ID); n > 0 {
			playerNumbers[p.ID] = n
			highest = max(highest, n)
		}
	}
	for _, p := range d.Players {
		if playerNumbers[p.ID] == 0 {
			highest++
			playerNumbers[p.ID] = highest
		}
	}

	playerDecks := make(map[string]*types.Deck)
	for _, p := range d.Players {
		n := playerNumbers[p.ID]
		deck := types.NewDeck()
		deck.ID = n
		deck.Seat = n
		deck.Date = dateStr
		deck.Metadata.DraftID = draft.ID

		// Download all available image variants into img/p<N>/.
		playerImgDir := filepath.Join(imgdir, fmt.Sprintf("p%d", n))
		downloadVariants(playerImgDir, "checkin", p.Images.Checkin, p.ID)
		downloadVariants(playerImgDir, "checkout", p.Images.Checkout, p.ID)
		downloadVariants(playerImgDir, "deck", p.Images.Deck, p.ID)

		playerDecks[p.ID] = deck
	}

	for _, m := range d.Matches {
		if m.IsBye {
			continue
		}

		p1Deck, ok1 := playerDecks[m.Player1ID]
		p2Deck, ok2 := playerDecks[m.Player2ID]

		if !ok1 || !ok2 {
			continue
		}

		draws := 0
		if len(m.Result) > 2 {
			draws = m.Result[2]
		}

		p1Deck.Matches = append(p1Deck.Matches, types.Match{
			OpponentID: p2Deck.ID,
			Round:      m.Round,
			Wins:       m.Result[0],
			Losses:     m.Result[1],
			Draws:      draws,
		})
		p2Deck.Matches = append(p2Deck.Matches, types.Match{
			OpponentID: p1Deck.ID,
			Round:      m.Round,
			Wins:       m.Result[1],
			Losses:     m.Result[0],
			Draws:      draws,
		})
	}

	for _, deck := range playerDecks {
		if err := draft.SaveDeck(deck); err != nil {
			return 0, fmt.Errorf("write deck file: %w", err)
		}
		logrus.Infof("Saved deck for seat %s", players.SeatLabel(deck.Seat))
	}

	return draft.ID, nil
}

// ListHedronDrafts returns every draft Hedron Network has for the given
// CubeCobra cube id.
func ListHedronDrafts(cubeID string) ([]HedronDraft, error) {
	return fetchHedronDrafts(cubeID)
}

// ImportHedronDraft imports one Hedron draft into outCube: it downloads the
// player photos, writes the draft directory and match records, reindexes, and
// returns the local draft ID. It returns an error rather than exiting.
func ImportHedronDraft(outCube, cubeID, hedronDraftID string) (int, error) {
	hedronDrafts, err := ListHedronDrafts(cubeID)
	if err != nil {
		return 0, err
	}
	if len(hedronDrafts) == 0 {
		return 0, fmt.Errorf("no drafts found for cube %s", cubeID)
	}
	var selected *HedronDraft
	for i := range hedronDrafts {
		if hedronDrafts[i].DraftID == hedronDraftID {
			selected = &hedronDrafts[i]
			break
		}
	}
	if selected == nil {
		return 0, fmt.Errorf("draft %s not found for cube %s", hedronDraftID, cubeID)
	}
	localID, err := importDraft(outCube, selected)
	if err != nil {
		return 0, err
	}
	if err := Index(outCube); err != nil {
		return 0, err
	}
	return localID, nil
}

// downloadVariants writes each image in refs to playerImgDir as
// "<kind>-<idx>.jpg", 1-indexed. Creates playerImgDir on first use.
func downloadVariants(playerImgDir, kind string, refs []HedronImageRef, playerLabel string) {
	if len(refs) == 0 {
		return
	}
	if err := os.MkdirAll(playerImgDir, os.ModePerm); err != nil {
		logrus.WithError(err).Warnf("Failed to create %s; skipping images", playerImgDir)
		return
	}
	for i, ref := range refs {
		filename := fmt.Sprintf("%s-%d.jpg", kind, i+1)
		dst := filepath.Join(playerImgDir, filename)
		url := "https://hedron.network" + ref.URL
		logrus.Infof("Downloading %s/%s for %s", filepath.Base(playerImgDir), filename, playerLabel)
		if err := downloadFile(url, dst); err != nil {
			logrus.WithError(err).Warnf("Failed to download %s for %s", filename, playerLabel)
			continue
		}
		if err := forceLandscape(dst); err != nil {
			logrus.WithError(err).Warnf("Failed to normalize orientation for %s", dst)
		}
	}
}

// forceLandscape applies any EXIF orientation and rotates the file 90° CCW
// if it's still physically portrait, so the on-disk image always reads as
// landscape regardless of viewer EXIF support.
func forceLandscape(path string) error {
	if err := exec.Command("mogrify", "-auto-orient", path).Run(); err != nil {
		return fmt.Errorf("auto-orient: %w", err)
	}
	out, err := exec.Command("identify", "-format", "%w %h", path).Output()
	if err != nil {
		return fmt.Errorf("identify: %w", err)
	}
	var w, h int
	if _, err := fmt.Sscanf(string(out), "%d %d", &w, &h); err != nil {
		return fmt.Errorf("parse dims %q: %w", string(out), err)
	}
	if h > w {
		if err := exec.Command("mogrify", "-rotate", "-90", path).Run(); err != nil {
			return fmt.Errorf("rotate: %w", err)
		}
	}
	return nil
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
