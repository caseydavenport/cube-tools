package commands

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

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

		drafts, err := fetchHedronDrafts(hedronCubeID)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to fetch drafts from Hedron")
		}

		if len(drafts) == 0 {
			logrus.Fatal("No drafts found for this cube on Hedron")
		}

		// Assign a stable per-draft seq within each (date, eventCode)
		// group by flight name. Used to disambiguate multiple drafts
		// from the same event on the same day.
		seqByDraftID := assignDraftSeqs(drafts)

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
				fmt.Printf("[%d] %s - %s / %s (%d players)\n", i, d.Date[:10], d.EventName, d.FlightName, len(d.Players))
			}
			fmt.Print("Select a draft index to import: ")
			var index int
			_, err := fmt.Scanln(&index)
			if err != nil || index < 0 || index >= len(drafts) {
				logrus.Fatal("Invalid selection")
			}
			selectedDraft = &drafts[index]
		}

		importDraft(hedronOutCube, selectedDraft, seqByDraftID[selectedDraft.DraftID])

		// Regenerate index.
		index(hedronOutCube)
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

// assignDraftSeqs returns a map from draft ID to its 1-indexed seq within
// the (date, eventCode) group, ordered by flight name. Lets the importer
// disambiguate multiple drafts of the same event on the same day with a
// stable, human-meaningful index.
func assignDraftSeqs(drafts []HedronDraft) map[string]int {
	type key struct{ date, event string }
	groups := map[key][]HedronDraft{}
	for _, d := range drafts {
		k := key{d.Date[:10], d.EventCode}
		groups[k] = append(groups[k], d)
	}
	out := map[string]int{}
	for _, group := range groups {
		sort.SliceStable(group, func(i, j int) bool {
			return group[i].FlightName < group[j].FlightName
		})
		for i, d := range group {
			out[d.DraftID] = i + 1
		}
	}
	return out
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

// localPlayerID returns the canonical player ID used inside this codebase:
// "<draftID>-p<N>" (e.g. "2026-01-17_p1p12026_1-p3").
func localPlayerID(draftID string, hedronPlayerID string) string {
	n := hedronPlayerNum(hedronPlayerID)
	if n == 0 {
		// Fall back to a sanitized form when the player ID doesn't fit
		// the "Player N" pattern.
		return fmt.Sprintf("%s-%s", draftID, strings.ToLower(strings.ReplaceAll(hedronPlayerID, " ", "")))
	}
	return fmt.Sprintf("%s-p%d", draftID, n)
}

func importDraft(cube string, d *HedronDraft, seq int) {
	dateStr := d.Date[:10]
	if seq < 1 {
		seq = 1
	}
	draftID := fmt.Sprintf("%s_%s_%d", dateStr, d.EventCode, seq)
	outdir := filepath.Join("data", cube, draftID)
	imgdir := filepath.Join(outdir, "img")

	// Error if the directory already exists to prevent accidental overwrites.
	if _, err := os.Stat(outdir); !os.IsNotExist(err) {
		logrus.Fatalf("Directory %s already exists. Please remove it before importing.", outdir)
	}

	if err := os.MkdirAll(imgdir, os.ModePerm); err != nil {
		logrus.WithError(err).Fatal("Failed to create directories")
	}

	draftMeta := &types.DraftMetadata{
		EventName:        d.EventName,
		EventDescription: fmt.Sprintf("Imported from Hedron Network. Event Code: %s, Flight: %s", d.EventCode, d.FlightName),
	}
	if err := draftMeta.Save(outdir); err != nil {
		logrus.WithError(err).Fatal("Failed to write draft metadata")
	}

	playerDecks := make(map[string]*types.Deck)

	for _, p := range d.Players {
		deck := types.NewDeck()
		deck.Player = localPlayerID(draftID, p.ID)
		deck.Date = dateStr
		deck.Metadata.DraftID = draftID

		// Download all available image variants into img/p<N>/.
		playerShort := strings.TrimPrefix(deck.Player, draftID+"-")
		playerImgDir := filepath.Join(imgdir, playerShort)
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

		winner := ""
		if m.Result[0] > m.Result[1] {
			winner = p1Deck.Player
		} else if m.Result[1] > m.Result[0] {
			winner = p2Deck.Player
		}

		draws := 0
		if len(m.Result) > 2 {
			draws = m.Result[2]
		}

		p1Deck.Matches = append(p1Deck.Matches, types.Match{
			Opponent: p2Deck.Player,
			Round:    m.Round,
			Wins:     m.Result[0],
			Losses:   m.Result[1],
			Draws:    draws,
			Winner:   winner,
		})
		p2Deck.Matches = append(p2Deck.Matches, types.Match{
			Opponent: p1Deck.Player,
			Round:    m.Round,
			Wins:     m.Result[1],
			Losses:   m.Result[0],
			Draws:    draws,
			Winner:   winner,
		})
	}

	for _, deck := range playerDecks {
		filename := filepath.Join(outdir, fmt.Sprintf("%s.json", deck.Player))
		deck.Metadata.Path = filename

		if err := deck.Save(filename); err != nil {
			logrus.WithError(err).Fatal("Failed to write deck file")
		}
		logrus.Infof("Saved deck for %s", deck.Player)
	}
}

// downloadVariants writes each image in refs to playerImgDir as
// "<kind>-<idx>.jpg", 1-indexed. Creates playerImgDir on first use.
func downloadVariants(playerImgDir, kind string, refs []HedronImageRef, playerLabel string) {
	if len(refs) == 0 {
		return
	}
	if err := os.MkdirAll(playerImgDir, os.ModePerm); err != nil {
		logrus.WithError(err).Fatalf("Failed to create %s", playerImgDir)
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
