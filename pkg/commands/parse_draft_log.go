package commands

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var DraftLogCmd = &cobra.Command{
	Use:   "parse-draft-log",
	Short: "Parse a draft log",
	Run: func(cmd *cobra.Command, args []string) {
		draft, err := drafts.Find(filepath.Join("data", cubeFlag), draftID)
		if err != nil {
			logrus.WithError(err).Fatalf("Failed to find draft %d", draftID)
		}
		parseDraftLog(draftLog, draft)
	},
}

func init() {
	// Add flags for the command to parse a single deck.
	flags := DraftLogCmd.Flags()
	flag.StringVarP(flags, &draftLog, "log-file", "f", "", "", "Path to the draft log file to parse.")
	flags.IntVar(&draftID, "draft", 0, "ID of the draft the log belongs to")
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	_ = DraftLogCmd.MarkFlagRequired("cube")
}

// parseDraftLog writes a deck into the draft for each player in the log.
func parseDraftLog(draftLog string, draft drafts.Draft) {
	logrus.Infof("Parsing draft log: %s", draftLog)
	log := loadDraftLog(draftLog)

	for _, d := range decksFromDraftLog(log, draft.Date) {
		if err := writeDeck(&d, draft); err != nil {
			logrus.WithError(err).WithField("player", d.Player).Fatal("Failed to write deck")
		}
	}
}

func loadDraftLog(file string) *types.DraftLog {
	f, err := os.Open(file)
	defer f.Close()
	if err != nil {
		panic(err)
	}
	bytes, err := io.ReadAll(f)
	if err != nil {
		panic(err)
	}
	draftLog := types.DraftLog{}
	json.Unmarshal(bytes, &draftLog)
	return &draftLog
}

func decksFromDraftLog(log *types.DraftLog, date string) []types.Deck {
	// Go through each user and build a deck for them.
	decks := []types.Deck{}
	for _, user := range log.Users {
		deck := types.Deck{
			Date: date,
		}
		deck.Player = strings.ToLower(user.UserName)
		for _, id := range user.Decklist.Main {
			oracleData := types.GetOracleData(log.Card(id).Name)
			deck.Mainboard = append(deck.Mainboard, types.FromOracle(oracleData))
		}
		for _, id := range user.Decklist.Side {
			oracleData := types.GetOracleData(log.Card(id).Name)
			deck.Sideboard = append(deck.Sideboard, types.FromOracle(oracleData))
		}
		decks = append(decks, deck)
	}
	return decks
}
