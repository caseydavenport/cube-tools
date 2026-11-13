package commands

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// hedronBaseURL is Hedron Network's address, a variable so tests can point it
// at a test server.
var hedronBaseURL = "https://hedron.network"

var (
	hedronCubeID  string
	hedronDraftID string
	hedronOutCube string
)

// ImportHedronCmd imports one of a cube's Hedron Network drafts, asking which
// when --draft isn't given.
var ImportHedronCmd = &cobra.Command{
	Use:   "import-hedron",
	Short: "Import a draft from Hedron Network",
	Run: func(cmd *cobra.Command, args []string) {
		if hedronCubeID == "" {
			logrus.Fatal("Must specify a CubeCobra ID or URL (--cube)")
		}

		hedronDrafts, err := ListHedronDrafts(hedronCubeID)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to fetch drafts from Hedron")
		}

		if len(hedronDrafts) == 0 {
			logrus.Fatal("No drafts found for this cube on Hedron")
		}

		var selectedDraft *HedronDraft
		if hedronDraftID != "" {
			selectedDraft = findHedronDraft(hedronDrafts, hedronDraftID)
			if selectedDraft == nil {
				logrus.Fatalf("Draft ID %s not found in search results", hedronDraftID)
			}
		} else {
			fmt.Println("Available drafts:")
			for i, d := range hedronDrafts {
				fmt.Printf("[%d] %s - %s / %s (%d players)\n", i, dateOnly(d.Date), d.EventName, d.FlightName, len(d.Players))
			}
			fmt.Print("Select a draft index to import: ")
			var index int
			_, err := fmt.Scanln(&index)
			if err != nil || index < 0 || index >= len(hedronDrafts) {
				logrus.Fatal("Invalid selection")
			}
			selectedDraft = &hedronDrafts[index]
		}

		cl, err := liveCube(hedronOutCube)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to fetch the cube list for the new draft")
		}
		localID, err := importDraft(hedronOutCube, cl, selectedDraft)
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
	flag.MarkRequired(ImportHedronCmd, "out-cube")
}

// hedronSearchResponse is Hedron Network's reply to a search for a cube's
// drafts, mirroring its JSON.
type hedronSearchResponse struct {
	Drafts []HedronDraft `json:"drafts"`
}

// HedronDraft is one draft (one flight of an event) as Hedron Network reports
// it. Date starts with the day as YYYY-MM-DD.
type HedronDraft struct {
	DraftID    string         `json:"draftId"`
	EventCode  string         `json:"eventCode"`
	EventName  string         `json:"eventName"`
	FlightName string         `json:"flightName"`
	Date       string         `json:"date"`
	Players    []HedronPlayer `json:"players"`
	Matches    []HedronMatch  `json:"matches"`
}

// HedronImageRef is a photo on Hedron Network, by its path on that site.
type HedronImageRef struct {
	URL string `json:"url"`
}

// HedronPlayer is a player in a HedronDraft. ID is Hedron's label such as
// "Player 8", not a name.
type HedronPlayer struct {
	ID     string       `json:"id"`
	Record string       `json:"record"`
	Images HedronImages `json:"images"`
}

// HedronImages is the photos a player took of their pool at each stage of the
// draft.
type HedronImages struct {
	Checkin  []HedronImageRef `json:"checkin"`
	Checkout []HedronImageRef `json:"checkout"`
	Deck     []HedronImageRef `json:"deck"`
}

// HedronMatch is one match of a HedronDraft, between players named by
// HedronPlayer.ID. Result is the games player 1 won and lost, then any drawn.
type HedronMatch struct {
	Round     int    `json:"round"`
	Player1ID string `json:"player1Id"`
	Player2ID string `json:"player2Id"`
	Result    []int  `json:"result"`
	IsBye     bool   `json:"isBye"`
}

// ListHedronDrafts returns every draft Hedron Network has for the given
// CubeCobra cube id.
func ListHedronDrafts(cubeID string) ([]HedronDraft, error) {
	resp, err := http.Get(fmt.Sprintf("%s/cube-results/search?cubeId=%s", hedronBaseURL, cubeID))
	if err != nil {
		return nil, err
	}
	defer logClose(resp.Body, "Hedron search response body")

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP error: %d", resp.StatusCode)
	}

	var searchResp hedronSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, err
	}

	return searchResp.Drafts, nil
}

// findHedronDraft returns the draft in hedronDrafts with the given Hedron draft
// ID, or nil if there is none.
func findHedronDraft(hedronDrafts []HedronDraft, hedronID string) *HedronDraft {
	for i := range hedronDrafts {
		if hedronDrafts[i].DraftID == hedronID {
			return &hedronDrafts[i]
		}
	}
	return nil
}

// dateOnly returns the YYYY-MM-DD start of a Hedron timestamp, or the whole
// string when it is shorter.
func dateOnly(timestamp string) string {
	if len(timestamp) > len("2006-01-02") {
		return timestamp[:len("2006-01-02")]
	}
	return timestamp
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

// numberHedronPlayers maps each player's Hedron ID to a seat number: the N of
// "Player N", or for an ID that doesn't fit that shape the next number after
// the highest N.
func numberHedronPlayers(hedronPlayers []HedronPlayer) map[string]int {
	playerSeats := map[string]int{}
	highest := 0
	for _, p := range hedronPlayers {
		if n := hedronPlayerNum(p.ID); n > 0 {
			playerSeats[p.ID] = n
			highest = max(highest, n)
		}
	}
	for _, p := range hedronPlayers {
		if playerSeats[p.ID] == 0 {
			highest++
			playerSeats[p.ID] = highest
		}
	}
	return playerSeats
}

// addHedronMatches records each non-bye match on both players' decks, from
// each side. A match whose player isn't in deckByPlayerID, or with fewer than
// two game results, is logged and skipped.
func addHedronMatches(deckByPlayerID map[string]*types.Deck, matches []HedronMatch) {
	for _, m := range matches {
		if m.IsBye {
			continue
		}

		p1Deck, ok1 := deckByPlayerID[m.Player1ID]
		p2Deck, ok2 := deckByPlayerID[m.Player2ID]
		if !ok1 || !ok2 {
			logrus.WithFields(logrus.Fields{"player1": m.Player1ID, "player2": m.Player2ID, "round": m.Round}).Warn("Skipping Hedron match with an unknown player")
			continue
		}
		if len(m.Result) < 2 {
			logrus.WithFields(logrus.Fields{"player1": m.Player1ID, "player2": m.Player2ID, "round": m.Round}).Warn("Skipping Hedron match with no game results")
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
}

// importDraft writes a Hedron draft into a new numbered draft of cube: one
// anonymous deck per player, with ID N for Hedron's "Player N", their
// downloaded photos under img/pN/, and both sides of every match. It returns
// the new draft's ID, or an error if the same event and flight is already
// imported.
func importDraft(cube string, cl *types.Cube, d *HedronDraft) (int, error) {
	dateStr := dateOnly(d.Date)
	if _, err := time.Parse("2006-01-02", dateStr); err != nil {
		return 0, fmt.Errorf("draft %s from Hedron has date %q, want YYYY-MM-DD", d.DraftID, d.Date)
	}
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
	}, cl)
	if err != nil {
		return 0, err
	}

	playerSeats := numberHedronPlayers(d.Players)
	deckByPlayerID := make(map[string]*types.Deck)
	for _, p := range d.Players {
		seat := playerSeats[p.ID]
		deck := types.NewDeck()
		deck.ID = seat
		deck.Seat = seat
		deck.Date = dateStr
		deck.Metadata.DraftID = draft.ID

		// Download all available image variants into the seat's photo folder.
		downloadVariants(draft, seat, drafts.PhotoCheckin, p.Images.Checkin, p.ID)
		downloadVariants(draft, seat, drafts.PhotoCheckout, p.Images.Checkout, p.ID)
		downloadVariants(draft, seat, drafts.PhotoDeck, p.Images.Deck, p.ID)

		deckByPlayerID[p.ID] = deck
	}

	addHedronMatches(deckByPlayerID, d.Matches)

	for _, deck := range deckByPlayerID {
		if err := draft.SaveDeck(deck); err != nil {
			discardDraft(draft)
			return 0, fmt.Errorf("write deck file: %w", err)
		}
		logrus.Infof("Saved deck for seat %s", players.SeatLabel(deck.Seat))
	}

	return draft.ID, nil
}

// ImportHedronDraft imports one Hedron draft into outCube: it downloads the
// player photos, writes the draft directory and match records, and returns the
// local draft ID. cl is outCube's list, saved with the draft. It returns an
// error rather than exiting.
func ImportHedronDraft(outCube string, cl *types.Cube, cubeID, hedronID string) (int, error) {
	hedronDrafts, err := ListHedronDrafts(cubeID)
	if err != nil {
		return 0, err
	}
	if len(hedronDrafts) == 0 {
		return 0, fmt.Errorf("no drafts found for cube %s", cubeID)
	}
	selected := findHedronDraft(hedronDrafts, hedronID)
	if selected == nil {
		return 0, fmt.Errorf("draft %s not found for cube %s", hedronID, cubeID)
	}
	return importDraft(outCube, cl, selected)
}

// downloadVariants writes each image in refs to the seat's photo folder as
// "<kind>-<idx>.jpg", 1-indexed. A failed download is logged and skipped.
func downloadVariants(draft drafts.Draft, seat int, kind drafts.PhotoKind, refs []HedronImageRef, playerLabel string) {
	for i, ref := range refs {
		dst, err := draft.NewPhotoPath(seat, kind, i+1, ".jpg")
		if err != nil {
			logrus.WithError(err).Warnf("Failed to create the photo folder for seat %d; skipping images", seat)
			return
		}
		filename := filepath.Base(dst)
		logrus.Infof("Downloading p%d/%s for %s", seat, filename, playerLabel)
		if err := downloadFile(hedronBaseURL+ref.URL, dst); err != nil {
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
// landscape regardless of viewer EXIF support. It needs ImageMagick's mogrify
// and identify on the PATH.
func forceLandscape(path string) error {
	if err := exec.Command("mogrify", "-auto-orient", path).Run(); err != nil {
		return fmt.Errorf("auto-orient: %w", err)
	}
	out, err := exec.Command("identify", "-format", "%w %h", path).Output()
	if err != nil {
		return fmt.Errorf("identify: %w", err)
	}
	var width, height int
	if _, err := fmt.Sscanf(string(out), "%d %d", &width, &height); err != nil {
		return fmt.Errorf("parse dims %q: %w", string(out), err)
	}
	if height > width {
		if err := exec.Command("mogrify", "-rotate", "-90", path).Run(); err != nil {
			return fmt.Errorf("rotate: %w", err)
		}
	}
	return nil
}

// downloadFile saves the body of a GET of url at path, replacing any file
// there. A non-200 answer is an error.
func downloadFile(url, path string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer logClose(resp.Body, "download response body")

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP error: %d", resp.StatusCode)
	}

	out, err := os.Create(path)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, resp.Body); err != nil {
		logClose(out, path)
		return err
	}
	return out.Close()
}
