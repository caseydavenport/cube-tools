package commands

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

var (
	// deckInput is the path to the deck file to parse.
	deckInput string
	labels    string
	who       string
	date      string

	// draftID is the ID of an existing draft to add decks to. Zero means
	// create a new draft from date and the event flags.
	draftID int

	// deckInputDir is the path to the directory containing deck files to parse.
	deckInputDir string

	// prefix and fileType are used to determine which files within the deckInputDir to parse.
	prefix   string
	fileType string

	// draftLog is the path to the draft log file.
	draftLog string

	// Per-draft metadata. If set, written to <draftDir>/metadata.json.
	eventName        string
	eventCode        string
	eventDescription string

	// cubeFlag is the cube ID that picks the data directory for all commands.
	cubeFlag string
)

// ParseCmd parses one deck file into a draft, for a player or an anonymous seat.
var ParseCmd = &cobra.Command{
	Use:   "parse",
	Short: "Parse a single deck file",
	Run: func(cmd *cobra.Command, args []string) {
		// Verify input.
		if deckInput == "" {
			logrus.Fatal("Must specify a deck file to parse.")
		}
		if who == "" && !anon {
			logrus.Fatal("Must specify a player with --who, or --anonymous.")
		}
		if err := parseOne(cubeFlag, deckInput, who, labels); err != nil {
			logrus.WithError(err).Fatal("Failed to parse deck")
		}
	},
}

// parseOne parses one deck file and writes it into the --draft draft, or a new
// draft created only once the deck has parsed. player is a player ID or name
// from the player list, ignored under --anonymous.
func parseOne(cube, deckFile, player, deckLabels string) error {
	playerID := 0
	if !anon {
		var err error
		if playerID, err = ResolvePlayer(player); err != nil {
			return err
		}
	}
	deckDate := date
	if draftID != 0 {
		draft, err := drafts.Find(filepath.Join("data", cube), draftID)
		if err != nil {
			return fmt.Errorf("find draft %d: %w", draftID, err)
		}
		deckDate = draft.Date
	}
	deck, err := parseDeck([]string{deckFile}, playerID, deckLabels, deckDate, draftID)
	if err != nil {
		return err
	}
	draft, created, err := resolveDraft(cube)
	if err != nil {
		return fmt.Errorf("find or create the draft: %w", err)
	}
	deck.Date = draft.Date
	return discardOnError(draft, created, writeDeck(deck, draft))
}

func init() {
	flags := ParseCmd.Flags()
	flag.StringVarP(flags, &deckInput, "deck", "d", "DECK", "", "Path to the deck file to import")
	flag.StringVarP(flags, &who, "who", "w", "WHO", "", "ID or name of the player who made the deck")
	flag.BoolVarP(flags, &anon, "anonymous", "a", "", false, "If set, the deck is an anonymous seat with no player")
	flag.StringVarP(flags, &labels, "labels", "l", "LABELS", "", "Labels describing the deck. e.g., aggro,sacrifice")
	addDraftFlags(flags)
	flag.StringVarP(flags, &eventDescription, "event-description", "", "EVENT_DESCRIPTION", "", "Event description (written to metadata.json)")
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	flag.MarkRequired(ParseCmd, "cube")
}

// addDraftFlags registers the flags that pick an existing draft (--draft) or
// describe a new one (--date and the event flags).
func addDraftFlags(flags *pflag.FlagSet) {
	flags.IntVar(&draftID, "draft", 0, "ID of an existing draft to add to; omit to create a new draft")
	flag.StringVarP(flags, &date, "date", "t", "DATE", "", "Date of a new draft, in YYYY-MM-DD format")
	flag.StringVarP(flags, &eventCode, "event-code", "", "EVENT_CODE", "", "Short code for a new draft's event, e.g. local or bcp26")
	flag.StringVarP(flags, &eventName, "event-name", "", "EVENT_NAME", "", "Human-readable event name (written to metadata.json)")
}

// resolveDraft returns the draft named by --draft, or creates a new one from
// --date and the event flags when --draft is unset. The bool reports whether
// it created the draft, so a failed import removes only a draft it made.
func resolveDraft(cube string) (drafts.Draft, bool, error) {
	cubeDir := filepath.Join("data", cube)
	if draftID != 0 {
		draft, err := drafts.Find(cubeDir, draftID)
		return draft, false, err
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return drafts.Draft{}, false, fmt.Errorf("a new draft needs --date in YYYY-MM-DD format, got %q", date)
	}
	cl, err := liveCube(cube)
	if err != nil {
		return drafts.Draft{}, false, fmt.Errorf("fetch the cube list for a new draft: %w", err)
	}
	draft, err := drafts.Create(cubeDir, types.DraftMetadata{
		Date:             date,
		EventName:        eventName,
		EventCode:        eventCode,
		EventDescription: eventDescription,
	}, cl)
	if err != nil {
		return drafts.Draft{}, false, err
	}
	logrus.WithField("draft", draft.ID).Info("Created draft; pass --draft to add more decks to it")
	return draft, true, nil
}

// parseDeck parses a deck's source files into a deck for the given draft and
// player, where player zero is an anonymous seat. One file is a combined deck
// (or a whole 45-card pool), and two files are a mainboard and a sideboard in
// either order. Macro archetypes in deckLabels (aggro, midrange, control) go to
// their own field instead of the label list.
func parseDeck(deckFiles []string, playerID int, deckLabels, draftDate string, deckDraftID int) (*types.Deck, error) {
	// A deck can be split across files, namely a mainboard and a sideboard.
	cardSets := [][]types.Card{}
	for _, f := range deckFiles {
		mainboard, sideboard, err := cardsFromDeckFile(f)
		if err != nil {
			return nil, err
		}

		cardSets = append(cardSets, mainboard)
		if len(sideboard) > 0 {
			cardSets = append(cardSets, sideboard)
		}
	}

	if len(cardSets) == 0 {
		return nil, fmt.Errorf("no cards found in deck files: %v", deckFiles)
	}
	if len(cardSets) > 2 {
		return nil, fmt.Errorf("too many card sets (%d) found in deck files: %v", len(cardSets), deckFiles)
	}

	deck := types.NewDeck()
	if len(deckLabels) > 0 {
		for _, label := range strings.Split(deckLabels, ",") {
			label = strings.TrimSpace(label)
			switch strings.ToLower(label) {
			case "aggro", "midrange", "control":
				deck.MacroArchetype = strings.ToLower(label)
			default:
				deck.Labels = append(deck.Labels, label)
			}
		}
	}
	deck.PlayerID = playerID
	deck.Date = draftDate
	deck.Metadata.DraftID = deckDraftID

	// Which card set is the mainboard is a guess: the longer one.
	if len(deckFiles) == 1 {
		if len(cardSets[0]) >= 45 {
			// A single card set of 45 or more cards is the draft pool, not a
			// mainboard and sideboard.
			deck.Pool = cardSets[0]
			deck.Metadata.PoolFile = deckFiles[0]
			return deck, nil
		}

		deck.Mainboard = cardSets[0]
		if len(cardSets) > 1 {
			deck.Sideboard = cardSets[1]
		}
		deck.Metadata.CombinedFile = deckFiles[0]
	} else if len(deckFiles) == 2 {
		if len(cardSets[0]) >= len(cardSets[1]) {
			deck.Mainboard = cardSets[0]
			deck.Sideboard = cardSets[1]
			deck.Metadata.MainboardFile = deckFiles[0]
			deck.Metadata.SideboardFile = deckFiles[1]
		} else {
			deck.Mainboard = cardSets[1]
			deck.Sideboard = cardSets[0]
			deck.Metadata.MainboardFile = deckFiles[1]
			deck.Metadata.SideboardFile = deckFiles[0]
		}
	}

	// Identical mainboard and sideboard means the same file was given twice.
	if !cardSetsDiffer(deck.Mainboard, deck.Sideboard) {
		return nil, fmt.Errorf("mainboard and sideboard are the same: %v", deckFiles)
	}

	// A short mainboard likely means a scan error or an unfinished deck.
	if len(deck.Mainboard) < 40 {
		logrus.WithFields(logrus.Fields{
			"files":     deckFiles,
			"mainboard": len(deck.Mainboard),
		}).Warn("Deck has less than 40 cards in the mainboard, likely a scan error or incomplete deck.")
	}

	if deck.PickCount() != 45 {
		logrus.WithFields(logrus.Fields{
			"files": deckFiles,
			"count": deck.PickCount(),
		}).Warn("Deck does not have 45 cards total (main + side), likely a scan error, incomplete deck, or unusual draft format.")
	}
	return deck, nil
}

// cardSetsDiffer returns true if the two slices of cards are not equal, ignoring order.
func cardSetsDiffer(first, second []types.Card) bool {
	if len(first) != len(second) {
		return true
	}
	numCopiesByName := make(map[string]int)
	for _, c := range first {
		numCopiesByName[c.Name]++
	}
	for _, c := range second {
		numCopiesByName[c.Name]--
	}
	for _, numCopies := range numCopiesByName {
		if numCopies != 0 {
			return true
		}
	}
	return false
}

// ParseDeckBytes parses an in-memory decklist. format is ".txt" (draftmancer
// style, "<count> <name>" per line, a blank line splitting mainboard from
// sideboard) or ".csv" (Delver Lens / CubeCobra export). It returns the
// mainboard and sideboard card lists.
func ParseDeckBytes(data []byte, format string) ([]types.Card, []types.Card, error) {
	switch format {
	case ".txt":
		mainboard, sideboard := cardsFromTXTBytes(data)
		return mainboard, sideboard, nil
	case ".csv":
		return cardsFromCSVBytes(data)
	default:
		return nil, nil, fmt.Errorf("unsupported deck format: %q", format)
	}
}

// cardsFromDeckFile reads a .csv or .txt deck file and returns its mainboard
// and sideboard.
func cardsFromDeckFile(deckFile string) ([]types.Card, []types.Card, error) {
	switch {
	case strings.HasSuffix(deckFile, ".csv"):
		return cardsFromCSV(deckFile)
	case strings.HasSuffix(deckFile, ".txt"):
		return cardsFromTXT(deckFile)
	default:
		return nil, nil, fmt.Errorf("unsupported file type: %s", deckFile)
	}
}

// writeDeck writes a parsed deck into a draft. A deck the draft already has,
// found by its ID or else by player ID, keeps its ID, player, notes, record,
// and annotations; a new deck gets the next ID and a file named for it. A deck
// with no player ID is an anonymous seat.
func writeDeck(d *types.Deck, draft drafts.Draft) error {
	// Event flags passed on the command line override the draft's metadata.
	if eventName != "" || eventDescription != "" {
		if eventName != "" {
			draft.EventName = eventName
		}
		if eventDescription != "" {
			draft.EventDescription = eventDescription
		}
		if err := draft.SaveMetadata(); err != nil {
			return fmt.Errorf("failed to write draft metadata: %w", err)
		}
	}

	// If the deck already exists, keep the fields captured since it was first
	// parsed so re-running the parse doesn't lose them.
	existing, err := existingDeck(d, draft)
	if err != nil {
		return err
	}
	if existing != nil {
		logrus.WithField("deck", existing.ID).Debug("Deck already exists, loading and updating")
		d.ID = existing.ID
		d.Notes = existing.Notes
		d.PlayerID = existing.PlayerID
		d.Seat = existing.Seat
		d.Labels = existing.Labels
		d.MacroArchetype = existing.MacroArchetype
		d.Matches = existing.Matches
		d.Colors = existing.Colors

		logrus.WithField("matches", d.Matches).Debug("Preserved existing deck data")
	}

	if d.ID == 0 {
		id, err := draft.NextDeckID()
		if err != nil {
			return fmt.Errorf("assign deck id: %w", err)
		}
		d.ID = id
	}

	// An anonymous deck needs a seat to be told apart; without one from the
	// source, it sits at its deck number.
	if d.PlayerID == 0 && d.Seat == 0 {
		d.Seat = d.ID
	}

	logc := logrus.WithFields(logrus.Fields{
		"player_id": d.PlayerID,
		"deck":      d.ID,
		"draft":     draft.ID,
		"count":     d.PickCount(),
	})
	logc.Infof("Writing deck")

	// Keep the original "raw" decklist with the draft and point the metadata at
	// the copy, so a reparse never needs the files it came from.
	copyIntoDraft := func(src, suffix, label string) string {
		if src == "" {
			return ""
		}
		dst, err := draft.CopySource(src, d.ID, suffix)
		if err != nil {
			logc.WithError(err).Warnf("Failed to copy %s file", label)
		}
		return dst
	}
	d.Metadata.CombinedFile = copyIntoDraft(d.Metadata.CombinedFile, "", "source")
	d.Metadata.MainboardFile = copyIntoDraft(d.Metadata.MainboardFile, "-mainboard", "mainboard")
	d.Metadata.SideboardFile = copyIntoDraft(d.Metadata.SideboardFile, "-sideboard", "sideboard")
	d.Metadata.PoolFile = copyIntoDraft(d.Metadata.PoolFile, "-pool", "pool")

	// The JSON is the source of truth; `export-cc` makes Cube Cobra exports on
	// demand.
	logc.Debug("Writing canonical deck file")
	if err := draft.SaveDeck(d); err != nil {
		return fmt.Errorf("save deck %d: %w", d.ID, err)
	}
	return nil
}

// existingDeck returns the deck in the draft that d replaces: the one with
// d's ID when it has one (a reparse), otherwise the one played by d's player.
// It returns nil for a new deck.
func existingDeck(d *types.Deck, draft drafts.Draft) (*types.Deck, error) {
	var existing *types.Deck
	var err error
	switch {
	case d.ID != 0:
		existing, err = draft.Deck(d.ID)
	case d.PlayerID != 0:
		existing, err = draft.DeckByPlayer(d.PlayerID)
	default:
		return nil, nil
	}
	if errors.Is(err, drafts.ErrNotFound) {
		return nil, nil
	}
	return existing, err
}

// cardsFromTXT imports cards from a .txt file, where the format is
// as produced by draftmancer.com - i.e, each line is:
//
//	1 <Cardname>
//
// A blank line separates the mainboard from the sideboard.
func cardsFromTXT(path string) ([]types.Card, []types.Card, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	mainboard, sideboard := cardsFromTXTBytes(b)
	return mainboard, sideboard, nil
}

// cardsFromTXTBytes is the byte-based core of cardsFromTXT.
func cardsFromTXTBytes(b []byte) ([]types.Card, []types.Card) {
	lines := strings.Split(string(b), "\n")

	inMainboard := true
	sawCard := false
	flipped := false

	mainboard := []types.Card{}
	sideboard := []types.Card{}
	for _, l := range lines {
		if len(l) == 0 {
			// A blank line divides mainboard from sideboard. Leading blanks
			// (before any card) don't count, and consecutive blanks are one
			// divider, so only the first blank after a card flips the section.
			if sawCard && !flipped {
				inMainboard = false
				flipped = true
			}
			continue
		}
		sawCard = true

		// A line is "<count> <name>", or just the name for a single copy.
		var name string
		splits := strings.SplitN(l, " ", 2)
		count, err := strconv.ParseInt(splits[0], 10, 32)
		if err != nil || len(splits) < 2 {
			name = l
			count = 1
		} else {
			name = splits[1]
		}

		for range int(count) {
			oracleData := types.GetOracleData(name)
			if oracleData.Name == "" {
				logrus.Errorf("Failed to find oracle data for: %s", name)
				continue
			}
			if inMainboard {
				mainboard = append(mainboard, types.FromOracle(oracleData))
			} else {
				sideboard = append(sideboard, types.FromOracle(oracleData))
			}
		}
	}
	return mainboard, sideboard
}

// cardsFromCSV imports cards from a .csv deck file; cardsFromCSVBytes
// describes the format.
func cardsFromCSV(path string) ([]types.Card, []types.Card, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	return cardsFromCSVBytes(b)
}

// cardsFromCSVBytes is the byte-based core of cardsFromCSV. The first row is
// a header with a Name column, and optionally Quantity (or Count) and
// maybeboard; a row of just "Sideboard" starts the sideboard.
func cardsFromCSVBytes(b []byte) ([]types.Card, []types.Card, error) {
	r := csv.NewReader(bytes.NewReader(b))

	// "Sideboard" marker rows have a different column count from card rows.
	r.FieldsPerRecord = -1
	records, err := r.ReadAll()
	if err != nil {
		return nil, nil, err
	}
	if len(records) == 0 {
		return nil, nil, nil
	}

	// CubeCobra exports have one row per card (no Quantity/Count column) and a
	// "maybeboard" column marking cards that aren't actually in the cube.
	quantityIdx := -1
	nameIdx := -1
	maybeboardIdx := -1
	for i, header := range records[0] {
		h := strings.TrimSpace(header)
		if strings.EqualFold(h, "Quantity") || strings.EqualFold(h, "Count") {
			quantityIdx = i
		}
		if strings.EqualFold(h, "Name") {
			nameIdx = i
		}
		if strings.EqualFold(h, "maybeboard") {
			maybeboardIdx = i
		}
	}
	if nameIdx < 0 {
		return nil, nil, fmt.Errorf("no name column in csv data")
	}

	mainboard := []types.Card{}
	sideboard := []types.Card{}
	inSideboard := false
	for _, row := range records[1:] {
		if len(row) == 0 {
			continue
		}

		// A "Sideboard" marker can appear as a single-column row.
		if len(row) == 1 && strings.EqualFold(strings.TrimSpace(row[0]), "Sideboard") {
			inSideboard = true
			continue
		}
		if nameIdx >= len(row) {
			continue
		}

		// Default to one copy when there's no quantity column (CubeCobra format).
		count := 1
		if quantityIdx >= 0 {
			if quantityIdx >= len(row) {
				continue
			}
			count, err = strconv.Atoi(strings.TrimSpace(row[quantityIdx]))
			if err != nil {
				return nil, nil, fmt.Errorf("error parsing row %v: %w", row, err)
			}
		}

		// Maybeboard cards aren't in the cube, so keep them out of the mainboard.
		maybeboard := maybeboardIdx >= 0 && maybeboardIdx < len(row) &&
			strings.EqualFold(strings.TrimSpace(row[maybeboardIdx]), "true")
		name := strings.TrimSpace(row[nameIdx])

		for range count {
			oracleData := types.GetOracleData(name)
			if oracleData.Name == "" {
				logrus.Errorf("Failed to find oracle data for: %s", name)
				continue
			}
			if inSideboard || maybeboard {
				sideboard = append(sideboard, types.FromOracle(oracleData))
			} else {
				mainboard = append(mainboard, types.FromOracle(oracleData))
			}
		}
	}
	return mainboard, sideboard, nil
}
