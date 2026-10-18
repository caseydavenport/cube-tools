package commands

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

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
	flag.BoolVarP(flags, &anon, "anonymous", "a", "", false, "If set, every deck is an anonymous seat with no player")
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	_ = DraftLogCmd.MarkFlagRequired("cube")
}

// parseDraftLog writes a deck into the draft for each player in the log.
func parseDraftLog(draftLog string, draft drafts.Draft) {
	logrus.Infof("Parsing draft log: %s", draftLog)
	log := loadDraftLog(draftLog)

	decks, err := decksFromDraftLog(log, draft.Date)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to match draft log users to players")
	}
	for _, d := range decks {
		if err := writeDeck(&d, draft); err != nil {
			logrus.WithError(err).WithField("player_id", d.PlayerID).Fatal("Failed to write deck")
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

// decksFromDraftLog builds a deck per user in the log. Each username goes
// through the nickname table and then the player list, unless --anonymous is
// set; an unknown username fails before any deck is built.
func decksFromDraftLog(log *types.DraftLog, date string) ([]types.Deck, error) {
	decks := []types.Deck{}
	userByPlayer := map[int]string{}
	for _, user := range log.Users {
		deck := types.Deck{
			Date: date,
		}
		if !anon {
			id, err := ResolvePlayer(determinePlayer(user.UserName))
			if err != nil {
				return nil, fmt.Errorf("draft log user %q: %w", user.UserName, err)
			}
			if other, dup := userByPlayer[id]; dup {
				return nil, fmt.Errorf("draft log users %q and %q both map to player %d", other, user.UserName, id)
			}
			userByPlayer[id] = user.UserName
			deck.PlayerID = id
		}
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
	return decks, nil
}
