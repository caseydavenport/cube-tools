package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// DraftLogCmd writes a deck into a draft for each player in a draft log file.
var DraftLogCmd = &cobra.Command{
	Use:   "parse-draft-log",
	Short: "Parse a draft log",
	Run: func(cmd *cobra.Command, args []string) {
		draft, err := drafts.Find(filepath.Join("data", cubeFlag), draftID)
		if err != nil {
			logrus.WithError(err).Fatalf("Failed to find draft %d", draftID)
		}
		if err := parseDraftLog(draftLog, draft); err != nil {
			logrus.WithError(err).Fatal("Failed to parse the draft log")
		}
	},
}

func init() {
	flags := DraftLogCmd.Flags()
	flag.StringVarP(flags, &draftLog, "log-file", "f", "", "", "Path to the draft log file to parse.")
	flags.IntVar(&draftID, "draft", 0, "ID of the draft the log belongs to")
	flag.BoolVarP(flags, &anon, "anonymous", "a", "", false, "If set, every deck is an anonymous seat with no player")
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	flag.MarkRequired(DraftLogCmd, "cube")
}

// parseDraftLog writes a deck into the draft for each player in the log.
func parseDraftLog(draftLog string, draft drafts.Draft) error {
	logrus.Infof("Parsing draft log: %s", draftLog)
	log, err := loadDraftLog(draftLog)
	if err != nil {
		return err
	}

	decks, err := decksFromDraftLog(log, draft.Date)
	if err != nil {
		return fmt.Errorf("match draft log users to players: %w", err)
	}
	for _, deck := range decks {
		if err := writeDeck(&deck, draft); err != nil {
			return fmt.Errorf("write deck for player %d: %w", deck.PlayerID, err)
		}
	}
	return nil
}

// loadDraftLog reads and decodes the draft log JSON at file.
func loadDraftLog(file string) (*types.DraftLog, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	draftLog := types.DraftLog{}
	if err := json.Unmarshal(data, &draftLog); err != nil {
		return nil, fmt.Errorf("decode draft log %s: %w", file, err)
	}
	return &draftLog, nil
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
