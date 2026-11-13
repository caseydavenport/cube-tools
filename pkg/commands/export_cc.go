package commands

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// DefaultCubeCobraURL is the public CubeCobra base URL used by the server and
// as the default for the export-cc command.
const DefaultCubeCobraURL = "https://cubecobra.com"

var (
	ccCubeID  string
	ccCookie  string
	ccBaseURL = DefaultCubeCobraURL
)

// ExportCCCmd uploads a draft's results and decks to a Cube Cobra record.
var ExportCCCmd = &cobra.Command{
	Use:   "export-cc",
	Short: "Export a draft to Cube Cobra",
	Run: func(cmd *cobra.Command, args []string) {
		if ccCubeID == "" {
			ccCubeID = cubeCobraID(cubeFlag)
		}
		if ccCubeID == "" {
			logrus.Fatalf("Cube %q has no CubeCobra ID in data/cubes.json; pass --cc-cube", cubeFlag)
		}
		if draftID == 0 {
			logrus.Fatal("Must specify a draft (--draft)")
		}
		draft, err := drafts.Find(filepath.Join("data", cubeFlag), draftID)
		if err != nil {
			logrus.WithError(err).Fatalf("Failed to find draft %d", draftID)
		}
		if ccCookie == "" {
			ccCookie = os.Getenv("CUBECOBRA_COOKIE")
		}
		if ccCookie == "" {
			logrus.Fatal("Must specify a CubeCobra session cookie (--cookie or CUBECOBRA_COOKIE env var)")
		}

		exportToCC(draft)
	},
}

func init() {
	flags := ExportCCCmd.Flags()
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	flags.IntVar(&draftID, "draft", 0, "ID of the draft to export (required)")
	flags.StringVar(&ccCubeID, "cc-cube", "", "CubeCobra cube ID; defaults to the cube's entry in data/cubes.json")
	flags.StringVarP(&ccCookie, "cookie", "k", "", "CubeCobra session cookie (full raw string)")
	flags.StringVar(&ccBaseURL, "url", DefaultCubeCobraURL, "CubeCobra base URL")
}

// CCRound is one round of a Cube Cobra record's results, mirroring the JSON
// Cube Cobra stores.
type CCRound struct {
	Matches []CCMatch `json:"matches"`
}

// CCMatch is one match of a CCRound between two players named in the record.
// Results is the games p1 won, lost and drew.
type CCMatch struct {
	P1      string `json:"p1"`
	P2      string `json:"p2"`
	Results []int  `json:"results"`
}

// CCPlayer is a player in a Cube Cobra record. UserID is the Cube Cobra
// account, empty for a player who has none.
type CCPlayer struct {
	Name   string `json:"name"`
	UserID string `json:"userId,omitempty"`
}

// ccRecord is a Cube Cobra draft record: the players, their match results by
// round, and who won the trophy. ID is empty until Cube Cobra has created it.
type ccRecord struct {
	ID          string     `json:"id,omitempty"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Date        int64      `json:"date"`
	Players     []CCPlayer `json:"players"`
	Matches     []CCRound  `json:"matches"`
	Trophy      []string   `json:"trophy"`
}

// exportToCC uploads a draft to CubeCobra: it updates the record named in the
// draft's metadata, or creates one and saves its ID there so the next export
// updates it instead of making a duplicate. It then uploads each deck.
func exportToCC(draft drafts.Draft) {
	playerList, err := players.Load("data")
	if err != nil {
		logrus.WithError(err).Fatal("Failed to load the player list")
	}
	decks, err := draft.Decks()
	if err != nil {
		logrus.WithError(err).Fatal("Failed to load decks")
	}
	playerList.ResolveDraft(decks)

	if len(decks) == 0 {
		logrus.Fatal("No decks found in directory")
	}

	// Cube Cobra answers with redirects that carry the record ID, so don't
	// follow them.
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	record := buildCCRecord(draft, decks)
	if draft.CubeCobraRecord == "" {
		draft.CubeCobraRecord = createCCRecord(client, draft, record)
	} else {
		updateCCRecord(client, draft.CubeCobraRecord, record)
	}
	record.ID = draft.CubeCobraRecord

	for i, deck := range decks {
		// Cube Cobra numbers the record's players from 1, in record order.
		uploadCCDeck(client, record, i+1, deck)
	}

	logrus.Infof("Export complete! Record: %s/cube/record/%s", ccBaseURL, record.ID)
}

// buildCCRecord builds the Cube Cobra record for a draft: every deck's player,
// each match once, in rounds, and a trophy for the player with the most match
// wins. Opponents that aren't a deck's player are left out, since Cube Cobra
// needs both sides of a match in the player list.
func buildCCRecord(draft drafts.Draft, decks []*types.Deck) ccRecord {
	name := draft.EventName
	if name == "" {
		name = drafts.DirName(draft.ID, draft.Date)
	}
	description := draft.EventDescription
	if description == "" {
		description = draft.Report()
	}

	record := ccRecord{
		Name:        name,
		Description: description,
		Date:        time.Now().UnixMilli(),
		Players:     make([]CCPlayer, 0),
		Matches:     make([]CCRound, 0),
		Trophy:      make([]string, 0),
	}
	if decks[0].Date != "" {
		if t, err := time.Parse("2006-01-02", decks[0].Date); err == nil {
			record.Date = t.UnixMilli()
		}
	}

	knownPlayer := make(map[string]bool, len(decks))
	for _, deck := range decks {
		record.Players = append(record.Players, CCPlayer{Name: deck.Player})
		knownPlayer[deck.Player] = true
	}

	type matchKey struct {
		firstPlayer  string
		secondPlayer string
		round        int
	}
	seenMatches := make(map[matchKey]bool)
	rounds := make(map[int]*CCRound)
	numMatchWinsByPlayer := make(map[string]int)

	for _, deck := range decks {
		for _, match := range deck.Matches {
			player := deck.Player
			opponent := match.Opponent

			// Skip synthetic or anonymized opponents (e.g. legacy
			// MatchWinsOverride records with no opponent name).
			if opponent == "" || !knownPlayer[opponent] {
				continue
			}

			// Both players' decks carry the match; keep one copy.
			key := matchKey{player, opponent, match.Round}
			if player > opponent {
				key = matchKey{opponent, player, match.Round}
			}
			if seenMatches[key] {
				continue
			}
			seenMatches[key] = true

			if match.Wins > match.Losses {
				numMatchWinsByPlayer[player]++
			} else if match.Losses > match.Wins {
				numMatchWinsByPlayer[opponent]++
			}

			// CubeCobra keys match results by player name (see analytics.ts: byPlayer is
			// keyed by player.name, then looked up via byPlayer[match.p1]).
			if rounds[match.Round] == nil {
				rounds[match.Round] = &CCRound{Matches: make([]CCMatch, 0)}
			}
			rounds[match.Round].Matches = append(rounds[match.Round].Matches, CCMatch{
				P1:      player,
				P2:      opponent,
				Results: []int{match.Wins, match.Losses, match.Draws},
			})
		}
	}

	roundNumbers := make([]int, 0, len(rounds))
	for round := range rounds {
		roundNumbers = append(roundNumbers, round)
	}
	sort.Ints(roundNumbers)

	// Round 0 means the round is unknown, so it goes last.
	if len(roundNumbers) > 0 && roundNumbers[0] == 0 {
		roundNumbers = append(roundNumbers[1:], 0)
	}
	for _, round := range roundNumbers {
		record.Matches = append(record.Matches, *rounds[round])
	}

	// Walk the players in record order so a tie for most wins is broken the
	// same way every export.
	topWinner := ""
	mostWins := 0
	for _, player := range record.Players {
		if wins := numMatchWinsByPlayer[player.Name]; wins > mostWins {
			mostWins = wins
			topWinner = player.Name
		}
	}
	if topWinner != "" {
		record.Trophy = append(record.Trophy, topWinner)
	}
	return record
}

// postCCForm sends fields as a form POST to path on Cube Cobra with the session
// cookie. A field that isn't a string is sent as JSON. The caller closes the
// response body.
func postCCForm(client *http.Client, path string, fields map[string]any) (*http.Response, error) {
	form := url.Values{}
	for name, value := range fields {
		if text, ok := value.(string); ok {
			form.Add(name, text)
			continue
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, fmt.Errorf("encode %s: %w", name, err)
		}
		form.Add(name, string(encoded))
	}

	req, err := http.NewRequest(http.MethodPost, ccBaseURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Add("Cookie", ccCookie)
	return client.Do(req)
}

// createCCRecord creates the record on Cube Cobra and returns its ID, which it
// also saves in the draft's metadata so the next export updates the record.
// Any failure is fatal, since nothing else can proceed without a record.
func createCCRecord(client *http.Client, draft drafts.Draft, record ccRecord) string {
	logrus.Infof("Draft %d has no CubeCobra record yet, creating one...", draft.ID)

	resp, err := postCCForm(client, "/cube/records/hedron/"+ccCubeID, map[string]any{"record": record})
	if err != nil {
		logrus.WithError(err).Fatal("Failed to create record")
	}
	defer logClose(resp.Body, "record creation response body")

	// A successful creation redirects to the new record's page.
	location := resp.Header.Get("Location")
	if !strings.Contains(location, "/cube/record/") {
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			logrus.WithError(err).Warn("Failed to read the record creation response")
		}
		logrus.Fatalf("Failed to create record (no redirect). Status: %d, Body: %s", resp.StatusCode, string(body))
	}

	parts := strings.Split(location, "/")
	recordID := parts[len(parts)-1]
	logrus.Infof("Created record %s", recordID)

	draft.CubeCobraRecord = recordID
	if err := draft.SaveMetadata(); err != nil {
		logrus.WithError(err).Fatal("Failed to save the CubeCobra record ID to the draft's metadata")
	}
	return recordID
}

// updateCCRecord replaces the overview, trophy and every round of the existing
// record recordID with record's. Cube Cobra edits each part with its own
// request, and a failed one is logged, so the rest still go through.
func updateCCRecord(client *http.Client, recordID string, record ccRecord) {
	logrus.Infof("Using existing record %s, updating overview...", recordID)

	resp, err := postCCForm(client, "/cube/records/edit/overview/"+recordID, map[string]any{"record": record})
	if err != nil {
		logrus.WithError(err).Warn("Failed to update record overview")
	} else {
		logClose(resp.Body, "overview response body")
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusFound {
			logrus.Warnf("Failed to update record overview: status %d", resp.StatusCode)
		} else {
			logrus.Infof("Updated record overview for %s", recordID)
		}
	}

	if len(record.Trophy) > 0 {
		logrus.Infof("Updating trophies for %s...", recordID)
		resp, err := postCCForm(client, "/cube/records/edit/trophy/"+recordID, map[string]any{"trophy": record.Trophy})
		if err != nil {
			logrus.WithError(err).Warn("Failed to update trophies")
		} else {
			logClose(resp.Body, "trophy response body")
			logrus.Infof("Updated trophies for %s", recordID)
		}
	}

	for i, round := range record.Matches {
		logrus.Infof("Updating match results for round %d of %s...", i+1, recordID)
		fields := map[string]any{
			"round":      round,
			"roundIndex": fmt.Sprintf("%d", i),
		}
		resp, err := postCCForm(client, "/cube/records/edit/round/edit/"+recordID, fields)
		if err != nil {
			logrus.WithError(err).Warnf("Failed to update match results for round %d", i+1)
			continue
		}
		logClose(resp.Body, "round response body")
		logrus.Infof("Updated matches for round %d", i+1)
	}
}

// uploadCCDeck uploads a deck as the record's player number userIndex. A deck
// with no cards is skipped, and a deck with only a draft pool uploads the pool
// as its mainboard. A failure is logged and doesn't stop the export.
func uploadCCDeck(client *http.Client, record ccRecord, userIndex int, deck *types.Deck) {
	if len(deck.Mainboard) == 0 && len(deck.Sideboard) == 0 && len(deck.Pool) == 0 {
		logrus.Infof("Skipping empty deck for %s", deck.Player)
		return
	}

	logrus.Infof("Uploading deck for %s...", deck.Player)

	mainboard := deck.Mainboard
	if len(mainboard) == 0 && len(deck.Pool) > 0 {
		logrus.Infof("Using pool for %s as mainboard", deck.Player)
		mainboard = deck.Pool
	}

	fields := map[string]any{
		"userIndex": fmt.Sprintf("%d", userIndex),
		"newRecord": "false",
		"mainboard": oracleIDs(mainboard),
		"sideboard": oracleIDs(deck.Sideboard),
		"record":    record,
	}
	resp, err := postCCForm(client, "/cube/records/import/"+ccCubeID, fields)
	if err != nil {
		logrus.WithError(err).Warnf("Failed to upload deck for %s", deck.Player)
		return
	}
	logClose(resp.Body, "deck upload response body")

	switch resp.StatusCode {
	case http.StatusFound:
		// Cube Cobra redirects here when the player already has a deck.
		if strings.Contains(resp.Header.Get("Location"), "/cube/records/uploaddeck/") {
			logrus.Infof("Deck for %s already exists, skipping", deck.Player)
		} else {
			logrus.Infof("Uploaded deck for %s", deck.Player)
		}
	case http.StatusOK:
		logrus.Infof("Uploaded deck for %s", deck.Player)
	default:
		logrus.Warnf("Failed to upload deck for %s: status %d", deck.Player, resp.StatusCode)
	}
}

// oracleIDs returns the Scryfall oracle ID of each card, skipping cards with no
// oracle data.
func oracleIDs(cards []types.Card) []string {
	ids := make([]string, 0, len(cards))
	for _, card := range cards {
		if oracle := types.GetOracleData(card.Name); oracle.OracleID != "" {
			ids = append(ids, oracle.OracleID)
		}
	}
	return ids
}
