package edit

import (
	"fmt"
	"strconv"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var AddMatchCmd = &cobra.Command{
	Use:   "add-match",
	Short: "Add a match to draft",
	Run: func(cmd *cobra.Command, args []string) {
		if date == "" {
			logrus.Fatal("Date is required")
		}
		if who == "" {
			logrus.Fatal("Player is required")
		}
		if opp == "" {
			logrus.Fatal("Opponent is required")
		}
		if record == "" {
			logrus.Fatal("Record is required")
		}
		clog := logrus.WithFields(logrus.Fields{"player1": who, "player2": opp, "date": date})
		clog.WithField("record", record).Info("Adding match to draft")

		// Parse the record string.
		w, l, t, err := parseRecord(record)
		if err != nil {
			clog.WithError(err).Fatal("Failed to parse record")
		}

		// Add the individual games, as well as the overall match to the first player.
		if err := addMatchToPlayer(who, opp, date, w, l, t); err != nil {
			clog.WithField("who", who).WithError(err).Fatal("Failed to add match to player")
		}
		// Add the individual games, as well as the overall match to the second player.
		if err := addMatchToPlayer(opp, who, date, l, w, t); err != nil {
			clog.WithField("who", opp).WithError(err).Fatal("Failed to add match to player")
		}
	},
}

var (
	who    string
	opp    string
	date   string
	record string
	force  bool
	anon   bool
)

func init() {
	// Add flags for the command to parse a single deck.
	flags := AddMatchCmd.Flags()
	flag.StringVarP(flags, &who, "who", "p", "WHO", "", "The player who played the match")
	flag.StringVarP(flags, &opp, "opponent", "o", "OPPONENT", "", "The opponent of the player who played the match")
	flag.StringVarP(flags, &date, "date", "d", "DATE", "", "The date of the draft.")
	flag.StringVarP(flags, &record, "record", "r", "RECORD", "", "The record of the player passed to 'who', formatted as 'W-L-T'")
	flag.BoolVarP(flags, &force, "force", "", "FORCE", false, "Force overwrite of any existing games against the opponent")
	flag.BoolVarP(flags, &anon, "anonymous", "a", "", false, "If set, anonymize player names in the output files.")
}

// parseRecord parses a record string into wins and losses.
func parseRecord(record string) (wins, losses, ties int, err error) {
	if record == "" {
		return 0, 0, 0, nil
	}
	if len(record) != 5 {
		return 0, 0, 0, fmt.Errorf("record must be formatted as 'W-L-T'")
	}
	if record[1] != '-' || record[3] != '-' {
		return 0, 0, 0, fmt.Errorf("record must be formatted as 'W-L'")
	}
	wins, err = strconv.Atoi(string(record[0]))
	if err != nil {
		return 0, 0, 0, fmt.Errorf("failed to parse wins")
	}
	losses, err = strconv.Atoi(string(record[2]))
	if err != nil {
		return 0, 0, 0, fmt.Errorf("failed to parse losses")
	}
	ties, err = strconv.Atoi(string(record[4]))
	if err != nil {
		return 0, 0, 0, fmt.Errorf("failed to parse ties")
	}
	return wins, losses, ties, nil
}

// addMatchToPlayer adds a match to the player's deck file within the draft.
func addMatchToPlayer(player, opponent string, date string, wins, losses, ties int) error {
	// If anon is set, anonymize the player and opponent names using the same scheme as when parsing decks.
	if anon {
		player = commands.Anonymize(date, player)
		opponent = commands.Anonymize(date, opponent)
	}

	// First, load the player's deck file from the draft.
	deck := commands.LoadParsedDeckFile(date, player)

	// Check if there are already games against this opponent. If there are, cowardly refuse to overwrite them
	// with the new match unless override is given.
	if !force && len(deck.GamesForOpponent(opponent)) > 0 {
		return fmt.Errorf("games against opponent already exist, cowardly refusing to overwrite")
	}

	// First, remove any games against this opponent, as we're going to write the new ones.
	deck.RemoveGamesForOpponent(opponent)
	for range wins {
		deck.AddGame(opponent, player)
	}
	for range losses {
		deck.AddGame(opponent, opponent)
	}
	for range ties {
		deck.AddGame(opponent, "")
	}

	// Remove any matches against this opponent, as we're going to write the new one.
	deck.RemoveMatchesForOpponent(opponent)
	if wins > losses {
		deck.AddMatch(opponent, player)
	} else if losses > wins {
		deck.AddMatch(opponent, opponent)
	} else {
		// Match was a draw.
		logrus.WithFields(logrus.Fields{"player": player, "opponent": opponent}).Info("Match was a draw")
		deck.AddMatch(opponent, "")
	}

	// Clear our the legacy win / loss fields, if set.
	deck.Wins = nil
	deck.Losses = nil

	// Save the updated deck.
	return commands.SaveDeck(deck)
}
