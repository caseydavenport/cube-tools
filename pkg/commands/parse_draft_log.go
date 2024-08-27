package commands

import (
	"encoding/json"
	"io"
	"os"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var DraftLogCmd = &cobra.Command{
	Use:   "parse-draft-log",
	Short: "Parse a draft log",
	Run: func(cmd *cobra.Command, args []string) {
		parseDraftLog(draftLog, date)
	},
}

func init() {
	// Add flags for the command to parse a single deck.
	flags := DraftLogCmd.Flags()
	flag.StringVarP(flags, &draftLog, "log-file", "f", "", "", "Path to the draft log file to parse.")
	flag.StringVarP(flags, &date, "date", "t", "DATE", "", "Date, in YYYY-MM-DD format")
}

func parseDraftLog(draftLog string, date string) {
	logrus.Infof("Parsing draft log: %s", draftLog)
	log := loadDraftLog(draftLog)

	// Determine if we need to auto-name the file.
	for _, d := range decksFromDraftLog(log, date) {
		// Write the deck for storage.
		writeDeck(&d, "", d.Player, date)
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
			Date:  date,
			Games: []types.Game{},
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
