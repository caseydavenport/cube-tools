package commands

import (
	"errors"
	"fmt"
	"path/filepath"
	"strconv"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
)

// anonymousRef is the word `players assign` takes to make a deck an anonymous
// seat.
const anonymousRef = "anonymous"

// PlayersCmd groups the commands that manage the global player list.
var PlayersCmd = &cobra.Command{
	Use:   "players",
	Short: "List, add, rename, and assign players",
}

var playersListCmd = &cobra.Command{
	Use:   "list",
	Short: "Print every player as id<TAB>name",
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		l, err := players.Load("data")
		if err != nil {
			logrus.WithError(err).Fatal("Failed to load the player list")
		}
		for _, p := range l.Players {
			fmt.Printf("%d\t%s\n", p.ID, p.Name)
		}
	},
}

var playersAddCmd = &cobra.Command{
	Use:   "add <name>",
	Short: "Add a player to the list",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		p, err := players.Add("data", args[0])
		if err != nil {
			logrus.WithError(err).Fatal("Failed to add player")
		}
		fmt.Printf("%d\t%s\n", p.ID, p.Name)
	},
}

var playersRenameCmd = &cobra.Command{
	Use:   "rename <id|name> <new name>",
	Short: "Change a player's display name",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		l, err := players.Load("data")
		if err != nil {
			logrus.WithError(err).Fatal("Failed to load the player list")
		}
		old, err := l.Lookup(args[0])
		if err != nil {
			logrus.WithError(err).Fatal("Failed to find player")
		}
		p, err := players.Rename("data", old.ID, args[1])
		if err != nil {
			logrus.WithError(err).Fatal("Failed to rename player")
		}
		fmt.Printf("%d\t%s\n", p.ID, p.Name)
	},
}

var assignDeckID int

var playersAssignCmd = &cobra.Command{
	Use:   "assign <id|name|anonymous>",
	Short: "Set which player a deck belongs to, or make it an anonymous seat",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if err := assignPlayer(cubeFlag, draftID, assignDeckID, args[0]); err != nil {
			logrus.WithError(err).Fatal("Failed to assign player")
		}
	},
}

func init() {
	PlayersCmd.AddCommand(playersListCmd, playersAddCmd, playersRenameCmd, playersAssignCmd)
	flags := playersAssignCmd.Flags()
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	flags.IntVar(&draftID, "draft", 0, "ID of the draft holding the deck (required)")
	flags.IntVar(&assignDeckID, "deck", 0, "ID of the deck within the draft (required)")
	for _, f := range []string{"cube", "draft", "deck"} {
		if err := playersAssignCmd.MarkFlagRequired(f); err != nil {
			logrus.WithError(err).Fatalf("Failed to mark --%s required", f)
		}
	}
}

// ResolvePlayer returns the ID of the player ref names, by ID or by name. An
// unknown player is an error that says how to add them.
func ResolvePlayer(ref string) (int, error) {
	l, err := players.Load("data")
	if err != nil {
		return 0, err
	}
	p, err := l.Lookup(ref)
	if errors.Is(err, players.ErrUnknownPlayer) {
		return 0, fmt.Errorf("unknown player %q; add them with: cube-tools players add %s", ref, strconv.Quote(ref))
	}
	if err != nil {
		return 0, err
	}
	return p.ID, nil
}

// assignPlayer points a deck at the player ref names, or makes it anonymous
// for "anonymous". It refuses a player who already has another deck in the
// draft.
func assignPlayer(cube string, draftID, deckID int, ref string) error {
	draft, err := drafts.Find(filepath.Join("data", cube), draftID)
	if err != nil {
		return fmt.Errorf("find draft %d: %w", draftID, err)
	}
	deck, err := draft.Deck(deckID)
	if err != nil {
		return fmt.Errorf("find deck %d: %w", deckID, err)
	}
	playerID := 0
	if ref != anonymousRef {
		if playerID, err = ResolvePlayer(ref); err != nil {
			return err
		}
		other, err := draft.DeckByPlayer(playerID)
		if err != nil && !errors.Is(err, drafts.ErrNotFound) {
			return err
		}
		if err == nil && other.ID != deckID {
			return fmt.Errorf("player %q already has deck %d in draft %d", ref, other.ID, draftID)
		}
	}
	deck.PlayerID = playerID
	return draft.SaveDeck(deck)
}
