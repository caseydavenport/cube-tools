package edit

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var AddMatchCmd = &cobra.Command{
	Use:   "add-match",
	Short: "Add a match to draft",
	Run: func(cmd *cobra.Command, args []string) {
		if draftID == 0 {
			logrus.Fatal("Draft is required")
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
		clog := logrus.WithFields(logrus.Fields{"player1": who, "player2": opp, "draft": draftID})
		clog.WithField("record", record).Info("Adding match to draft")

		// Parse the record string.
		w, l, t, err := parseRecord(record)
		if err != nil {
			clog.WithError(err).Fatal("Failed to parse record")
		}

		draft, err := drafts.Find(filepath.Join("data", cubeFlag), draftID)
		if err != nil {
			clog.WithError(err).Fatal("Failed to find draft")
		}
		if err := addMatch(draft, who, opp, w, l, t); err != nil {
			clog.WithError(err).Fatal("Failed to add match")
		}
	},
}

var (
	who      string
	opp      string
	draftID  int
	record   string
	force    bool
	cubeFlag string
)

func init() {
	// Add flags for the command to parse a single deck.
	flags := AddMatchCmd.Flags()
	flag.StringVarP(flags, &who, "who", "p", "WHO", "", "The player who played the match: an ID, a name, or a seat label like p3")
	flag.StringVarP(flags, &opp, "opponent", "o", "OPPONENT", "", "The opponent, in the same forms as --who")
	flags.IntVar(&draftID, "draft", 0, "ID of the draft the match was played in (required)")
	flag.StringVarP(flags, &record, "record", "r", "RECORD", "", "The record of the player passed to 'who', formatted as 'W-L-T'")
	flag.BoolVarP(flags, &force, "force", "", "FORCE", false, "Force overwrite of any existing games against the opponent")
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	_ = AddMatchCmd.MarkFlagRequired("cube")
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

// seatRE matches a seat label naming an anonymous deck by its seat number.
var seatRE = regexp.MustCompile(`^[pP](\d+)$`)

// findDeck returns the deck in the draft that ref names: a seat label like
// "p3" for an anonymous deck, or a player's ID or name.
func findDeck(draft drafts.Draft, ref string) (*types.Deck, string, error) {
	if m := seatRE.FindStringSubmatch(ref); m != nil {
		seat, err := strconv.Atoi(m[1])
		if err != nil {
			return nil, "", err
		}
		deck, path, err := findSeat(draft, seat)
		if err != nil {
			return nil, "", err
		}
		if deck.PlayerID != 0 {
			return nil, "", fmt.Errorf("seat %d is not an anonymous seat; name its player instead", seat)
		}
		return deck, path, nil
	}
	playerID, err := commands.ResolvePlayer(ref)
	if err != nil {
		return nil, "", err
	}
	deck, path, err := drafts.FindDeckByPlayerID(draft.Dir, playerID)
	if err != nil {
		return nil, "", fmt.Errorf("find deck for %s: %w", ref, err)
	}
	return deck, path, nil
}

// findSeat returns the deck in the draft sitting at the given seat number.
func findSeat(draft drafts.Draft, seat int) (*types.Deck, string, error) {
	files, err := drafts.DeckFiles(draft.Dir)
	if err != nil {
		return nil, "", err
	}
	for _, f := range files {
		d, err := types.LoadDeck(f)
		if err != nil {
			return nil, "", fmt.Errorf("load deck %s: %w", f, err)
		}
		if d.SeatNumber() == seat {
			return d, f, nil
		}
	}
	return nil, "", fmt.Errorf("no deck at seat %d in draft %d", seat, draft.ID)
}

// addMatch records a match between two decks of the draft, from who's side
// with the given game counts, and mirrors it onto the opponent's deck. It
// refuses to replace an existing match between them unless --force is set.
func addMatch(draft drafts.Draft, whoRef, oppRef string, wins, losses, ties int) error {
	deck, path, err := findDeck(draft, whoRef)
	if err != nil {
		return err
	}
	oppDeck, oppPath, err := findDeck(draft, oppRef)
	if err != nil {
		return err
	}

	var games []types.Game
	for range wins {
		games = append(games, types.Game{Won: true})
	}
	for range losses {
		games = append(games, types.Game{})
	}
	for range ties {
		games = append(games, types.Game{Tie: true})
	}
	mirrored := make([]types.Game, len(games))
	for i, g := range games {
		mirrored[i] = types.Game{Won: !g.Won && !g.Tie, Tie: g.Tie}
	}
	if wins == losses {
		logrus.WithFields(logrus.Fields{"player": whoRef, "opponent": oppRef}).Info("Match was a draw")
	}

	if err := setMatch(deck, types.Match{OpponentID: oppDeck.ID, Wins: wins, Losses: losses, Draws: ties, Games: games}); err != nil {
		return err
	}
	if err := setMatch(oppDeck, types.Match{OpponentID: deck.ID, Wins: losses, Losses: wins, Draws: ties, Games: mirrored}); err != nil {
		return err
	}
	if err := deck.Save(path); err != nil {
		return err
	}
	return oppDeck.Save(oppPath)
}

// setMatch replaces the deck's match against m's opponent with m, refusing to
// overwrite an existing one unless --force is set.
func setMatch(deck *types.Deck, m types.Match) error {
	var kept []types.Match
	for _, existing := range deck.Matches {
		if existing.OpponentID == m.OpponentID {
			if !force {
				return fmt.Errorf("deck %d already has a match against deck %d; pass --force to replace it", deck.ID, m.OpponentID)
			}
			continue
		}
		kept = append(kept, existing)
	}
	deck.Matches = append(kept, m)
	return nil
}
