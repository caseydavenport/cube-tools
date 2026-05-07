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

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var (
	ccCubeID   string
	ccDraftDir string
	ccCookie   string
	ccBaseURL  string = "https://cubecobra.com"
)

var ExportCCCmd = &cobra.Command{
	Use:   "export-cc",
	Short: "Export a draft to Cube Cobra",
	Run: func(cmd *cobra.Command, args []string) {
		if ccCubeID == "" {
			logrus.Fatal("Must specify a CubeCobra ID (--cube)")
		}
		if ccDraftDir == "" {
			logrus.Fatal("Must specify a draft directory (--dir)")
		}
		if ccCookie == "" {
			ccCookie = os.Getenv("CUBECOBRA_COOKIE")
		}
		if ccCookie == "" {
			logrus.Fatal("Must specify a CubeCobra session cookie (--cookie or CUBECOBRA_COOKIE env var)")
		}

		exportToCC()
	},
}

func init() {
	flags := ExportCCCmd.Flags()
	flags.StringVarP(&ccCubeID, "cube", "c", "", "CubeCobra ID")
	flags.StringVarP(&ccDraftDir, "dir", "d", "", "Draft directory to export")
	flags.StringVarP(&ccCookie, "cookie", "k", "", "CubeCobra session cookie (full raw string)")
	flags.StringVar(&ccBaseURL, "url", "https://cubecobra.com", "CubeCobra base URL")
}

type CCRound struct {
	Matches []CCMatch `json:"matches"`
}

type CCMatch struct {
	P1      string `json:"p1"`
	P2      string `json:"p2"`
	Results []int  `json:"results"`
}

type CCPlayer struct {
	Name   string `json:"name"`
	UserID string `json:"userId,omitempty"`
}

type CCRecord struct {
	ID          string     `json:"id,omitempty"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Date        int64      `json:"date"`
	Players     []CCPlayer `json:"players"`
	Matches     []CCRound  `json:"matches"`
	Trophy      []string   `json:"trophy"`
}

func exportToCC() {
	decks := make([]*types.Deck, 0)
	files, err := filepath.Glob(filepath.Join(ccDraftDir, "*.json"))
	if err != nil {
		logrus.WithError(err).Fatal("Failed to glob deck files")
	}

	for _, f := range files {
		base := filepath.Base(f)
		switch base {
		case "index.json", "cube.json", "cube-rules.json", types.DraftMetadataFilename:
			continue
		}
		if strings.Contains(f, "snapshot") || strings.Contains(f, "draft-log") {
			continue
		}
		d, err := types.LoadDeck(f)
		if err != nil {
			logrus.WithError(err).Warnf("Failed to load deck %s", f)
			continue
		}
		decks = append(decks, d)
	}

	if len(decks) == 0 {
		logrus.Fatal("No decks found in directory")
	}

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	draftID := decks[0].Metadata.DraftID

	// Resolve cube ID to actual UUID if it's a shortId.
	// CubeCobra's record list API requires the internal UUID for GSI lookups.
	cubeUUID := getCubeUUID(client, ccCubeID)
	if cubeUUID == "" {
		logrus.Warnf("Could not resolve UUID for cube %s, falling back to literal ID", ccCubeID)
		cubeUUID = ccCubeID
	} else {
		logrus.Debugf("Resolved cube %s to UUID %s", ccCubeID, cubeUUID)
	}

	recordID := findExistingRecord(client, cubeUUID, draftID)

	draftMeta, err := types.LoadDraftMetadata(ccDraftDir)
	if err != nil {
		logrus.WithError(err).Warnf("Failed to load draft metadata from %s", ccDraftDir)
		draftMeta = &types.DraftMetadata{}
	}

	recordName := draftMeta.EventName
	if recordName == "" {
		recordName = filepath.Base(ccDraftDir)
	}

	recordDescription := draftMeta.EventDescription
	if recordDescription == "" {
		// Try to read a REPORT file in the draft directory.
		reportPath := filepath.Join(ccDraftDir, "REPORT")
		if bs, err := os.ReadFile(reportPath); err == nil {
			recordDescription = string(bs)
		}
	}
	if recordDescription == "" {
		recordDescription = fmt.Sprintf("Exported from cube-tools. Draft ID: %s", draftID)
	}

	record := CCRecord{
		Name:        recordName,
		Description: recordDescription,
		Date:        time.Now().Unix() * 1000,
		Players:     make([]CCPlayer, 0),
		Matches:     make([]CCRound, 0),
		Trophy:      make([]string, 0),
	}
	if decks[0].Date != "" {
		if t, err := time.Parse("2006-01-02", decks[0].Date); err == nil {
			record.Date = t.Unix() * 1000
		}
	}

	for _, d := range decks {
		record.Players = append(record.Players, CCPlayer{Name: d.Player})
	}

	type matchKey struct {
		p1, p2 string
		round  int
	}
	processedMatches := make(map[matchKey]bool)
	rounds := make(map[int]*CCRound)

	knownPlayer := make(map[string]bool, len(decks))
	for _, d := range decks {
		knownPlayer[d.Player] = true
	}

	playerWins := make(map[string]int)

	for _, d := range decks {
		for _, m := range d.Matches {
			p1 := d.Player
			p2 := m.Opponent
			round := m.Round

			// CubeCobra requires both p1 and p2 to be in the player list.
			// Skip synthetic / anonymized opponent entries (e.g. legacy
			// MatchWinsOverride records with no opponent name).
			if p2 == "" || !knownPlayer[p2] {
				continue
			}

			key := matchKey{p1, p2, round}
			if p1 > p2 {
				key = matchKey{p2, p1, round}
			}

			if processedMatches[key] {
				continue
			}
			processedMatches[key] = true

			wins := m.Wins
			losses := m.Losses
			draws := m.Draws

			if wins > losses {
				playerWins[p1]++
			} else if losses > wins {
				playerWins[p2]++
			}

			// CubeCobra keys match results by player name (see analytics.ts: byPlayer is
			// keyed by player.name, then looked up via byPlayer[match.p1]).
			if rounds[round] == nil {
				rounds[round] = &CCRound{Matches: make([]CCMatch, 0)}
			}
			rounds[round].Matches = append(rounds[round].Matches, CCMatch{
				P1:      p1,
				P2:      p2,
				Results: []int{wins, losses, draws},
			})
		}
	}

	// Sort rounds and add to record.
	roundNums := make([]int, 0, len(rounds))
	for r := range rounds {
		roundNums = append(roundNums, r)
	}
	sort.Ints(roundNums)

	// Round 0 (unknown) should be last.
	if len(roundNums) > 0 && roundNums[0] == 0 {
		roundNums = append(roundNums[1:], 0)
	}

	for _, r := range roundNums {
		record.Matches = append(record.Matches, *rounds[r])
	}

	topWinner := ""
	maxWins := -1
	for p, w := range playerWins {
		if w > maxWins {
			maxWins = w
			topWinner = p
		}
	}
	if topWinner != "" {
		record.Trophy = append(record.Trophy, topWinner)
	}

	if recordID == "" {
		logrus.Infof("No existing record found for Draft ID %s, creating new one...", draftID)
		recordJSON, _ := json.Marshal(record)

		form := url.Values{}
		form.Add("record", string(recordJSON))

		req, _ := http.NewRequest("POST", fmt.Sprintf("%s/cube/records/hedron/%s", ccBaseURL, ccCubeID), strings.NewReader(form.Encode()))
		req.Header.Add("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Add("Cookie", ccCookie)

		resp, err := client.Do(req)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to create record")
		}
		defer resp.Body.Close()

		location := resp.Header.Get("Location")
		if location == "" || !strings.Contains(location, "/cube/record/") {
			body, _ := io.ReadAll(resp.Body)
			logrus.Fatalf("Failed to create record (no redirect). Status: %d, Body: %s", resp.StatusCode, string(body))
		}

		parts := strings.Split(location, "/")
		recordID = parts[len(parts)-1]
		logrus.Infof("Created record %s", recordID)
	} else {
		logrus.Infof("Using existing record %s, updating overview...", recordID)

		recordJSON, _ := json.Marshal(record)
		form := url.Values{}
		form.Add("record", string(recordJSON))

		req, _ := http.NewRequest("POST", fmt.Sprintf("%s/cube/records/edit/overview/%s", ccBaseURL, recordID), strings.NewReader(form.Encode()))
		req.Header.Add("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Add("Cookie", ccCookie)

		resp, err := client.Do(req)
		if err != nil {
			logrus.WithError(err).Warn("Failed to update record overview")
		} else {
			resp.Body.Close()
			if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusFound {
				logrus.Warnf("Failed to update record overview: status %d", resp.StatusCode)
			} else {
				logrus.Infof("Updated record overview for %s", recordID)
			}
		}

		// Update Trophies
		if len(record.Trophy) > 0 {
			logrus.Infof("Updating trophies for %s...", recordID)
			trophyJSON, _ := json.Marshal(record.Trophy)
			formTrophy := url.Values{}
			formTrophy.Add("trophy", string(trophyJSON))
			reqTrophy, _ := http.NewRequest("POST", fmt.Sprintf("%s/cube/records/edit/trophy/%s", ccBaseURL, recordID), strings.NewReader(formTrophy.Encode()))
			reqTrophy.Header.Add("Content-Type", "application/x-www-form-urlencoded")
			reqTrophy.Header.Add("Cookie", ccCookie)
			if resp, err := client.Do(reqTrophy); err == nil {
				resp.Body.Close()
				logrus.Infof("Updated trophies for %s", recordID)
			}
		}

		// Update Matches
		for i, round := range record.Matches {
			logrus.Infof("Updating match results for round %d of %s...", i+1, recordID)
			roundJSON, _ := json.Marshal(round)
			formRound := url.Values{}
			formRound.Add("round", string(roundJSON))
			formRound.Add("roundIndex", fmt.Sprintf("%d", i))
			reqRound, _ := http.NewRequest("POST", fmt.Sprintf("%s/cube/records/edit/round/edit/%s", ccBaseURL, recordID), strings.NewReader(formRound.Encode()))
			reqRound.Header.Add("Content-Type", "application/x-www-form-urlencoded")
			reqRound.Header.Add("Cookie", ccCookie)
			if resp, err := client.Do(reqRound); err == nil {
				resp.Body.Close()
				logrus.Infof("Updated matches for round %d", i+1)
			}
		}
	}
	record.ID = recordID
	for i, d := range decks {
		hasCards := len(d.Mainboard) > 0 || len(d.Sideboard) > 0 || len(d.Pool) > 0
		if !hasCards {
			logrus.Infof("Skipping empty deck for %s", d.Player)
			continue
		}

		logrus.Infof("Uploading deck for %s...", d.Player)

		mainboard := make([]string, 0)
		sourceCards := d.Mainboard
		if len(sourceCards) == 0 && len(d.Pool) > 0 {
			logrus.Infof("Using pool for %s as mainboard", d.Player)
			sourceCards = d.Pool
		}

		for _, c := range sourceCards {
			oracleData := types.GetOracleData(c.Name)
			if oracleData.OracleID != "" {
				mainboard = append(mainboard, oracleData.OracleID)
			}
		}
		sideboard := make([]string, 0)
		for _, c := range d.Sideboard {
			oracleData := types.GetOracleData(c.Name)
			if oracleData.OracleID != "" {
				sideboard = append(sideboard, oracleData.OracleID)
			}
		}

		mainJSON, _ := json.Marshal(mainboard)
		sideJSON, _ := json.Marshal(sideboard)
		fullRecordJSON, _ := json.Marshal(record)

		form := url.Values{}
		form.Add("userIndex", fmt.Sprintf("%d", i+1))
		form.Add("newRecord", "false")
		form.Add("mainboard", string(mainJSON))
		form.Add("sideboard", string(sideJSON))
		form.Add("record", string(fullRecordJSON))

		req, _ := http.NewRequest("POST", fmt.Sprintf("%s/cube/records/import/%s", ccBaseURL, ccCubeID), strings.NewReader(form.Encode()))
		req.Header.Add("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Add("Cookie", ccCookie)

		resp, err := client.Do(req)
		if err != nil {
			logrus.WithError(err).Warnf("Failed to upload deck for %s", d.Player)
			continue
		}
		resp.Body.Close()

		if resp.StatusCode == http.StatusFound {
			location := resp.Header.Get("Location")
			if strings.Contains(location, "/cube/records/uploaddeck/") {
				logrus.Infof("Deck for %s already exists, skipping", d.Player)
			} else {
				logrus.Infof("Uploaded deck for %s", d.Player)
			}
		} else if resp.StatusCode == http.StatusOK {
			logrus.Infof("Uploaded deck for %s", d.Player)
		} else {
			logrus.Warnf("Failed to upload deck for %s: status %d", d.Player, resp.StatusCode)
		}
	}

	logrus.Infof("Export complete! Record: %s/cube/record/%s", ccBaseURL, recordID)
}

func findExistingRecord(client *http.Client, cubeID string, draftID string) string {
	logrus.Infof("Checking for existing record with Draft ID %s...", draftID)

	searchStr := fmt.Sprintf("Draft ID: %s", draftID)
	var lastKey any

	for {
		body := map[string]any{}
		if lastKey != nil {
			body["lastKey"] = lastKey
		}
		bodyJSON, _ := json.Marshal(body)

		req, _ := http.NewRequest("POST", fmt.Sprintf("%s/cube/records/list/%s", ccBaseURL, cubeID), strings.NewReader(string(bodyJSON)))
		req.Header.Add("Content-Type", "application/json")
		req.Header.Add("Cookie", ccCookie)

		resp, err := client.Do(req)
		if err != nil {
			logrus.WithError(err).Warn("Failed to list records")
			return ""
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			logrus.Warnf("Failed to list records: status %d, body: %s", resp.StatusCode, string(body))
			return ""
		}

		var result struct {
			Records []CCRecord `json:"records"`
			LastKey any        `json:"lastKey"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			resp.Body.Close()
			logrus.WithError(err).Warn("Failed to decode record list")
			return ""
		}
		resp.Body.Close()

		logrus.Infof("Fetched %d records from CubeCobra...", len(result.Records))
		for _, r := range result.Records {
			logrus.Debugf("Checking record %s: %s (Description: %s)", r.ID, r.Name, r.Description)
			if strings.Contains(r.Description, searchStr) {
				logrus.Infof("Found existing record: %s", r.ID)
				return r.ID
			}
		}

		if result.LastKey == nil {
			break
		}
		lastKey = result.LastKey
	}

	logrus.Info("No existing record found for this Draft ID")
	return ""
}

func getCubeUUID(client *http.Client, cubeID string) string {
	logrus.Infof("Resolving cube ID for %s...", cubeID)

	req, _ := http.NewRequest("POST", fmt.Sprintf("%s/cube/api/cubemetadata/%s", ccBaseURL, cubeID), nil)
	req.Header.Add("Cookie", ccCookie)

	resp, err := client.Do(req)
	if err != nil {
		logrus.WithError(err).Warn("Failed to get cube metadata")
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		logrus.Warnf("Failed to get cube metadata: status %d", resp.StatusCode)
		return ""
	}

	var result struct {
		Success string `json:"success"`
		Cube    struct {
			ID string `json:"id"`
		} `json:"cube"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		logrus.WithError(err).Warn("Failed to decode cube metadata")
		return ""
	}

	return result.Cube.ID
}
