package commands

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
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

	// cubeFlag is the cube ID used to determine the data directory for all commands.
	cubeFlag string
)

// Define a cobra command for parsing a single deck file.
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
func parseOne(cube, deckFile, player, labels string) error {
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
	d, err := parseDeck([]string{deckFile}, playerID, labels, deckDate, draftID)
	if err != nil {
		return err
	}
	draft, created, err := resolveDraft(cube)
	if err != nil {
		return fmt.Errorf("find or create the draft: %w", err)
	}
	d.Date = draft.Date
	return discardOnError(draft, created, writeDeck(d, draft))
}

func init() {
	// Add flags for the command to parse a single deck.
	flags := ParseCmd.Flags()
	flag.StringVarP(flags, &deckInput, "deck", "d", "DECK", "", "Path to the deck file to import")
	flag.StringVarP(flags, &who, "who", "w", "WHO", "", "ID or name of the player who made the deck")
	flag.BoolVarP(flags, &anon, "anonymous", "a", "", false, "If set, the deck is an anonymous seat with no player")
	flag.StringVarP(flags, &labels, "labels", "l", "LABELS", "", "Labels describing the deck. e.g., aggro,sacrifice")
	addDraftFlags(flags)
	flag.StringVarP(flags, &eventDescription, "event-description", "", "EVENT_DESCRIPTION", "", "Event description (written to metadata.json)")
	flags.StringVar(&cubeFlag, "cube", "", "cube id (required)")
	_ = ParseCmd.MarkFlagRequired("cube")
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
	draft, err := drafts.Create(cubeDir, types.DraftMetadata{
		Date:             date,
		EventName:        eventName,
		EventCode:        eventCode,
		EventDescription: eventDescription,
	})
	if err != nil {
		return drafts.Draft{}, false, err
	}
	logrus.WithField("draft", draft.ID).Info("Created draft; pass --draft to add more decks to it")
	return draft, true, nil
}

// parseDeck parses a deck's source files into a deck for the given draft and
// player, where player zero is an anonymous seat.
func parseDeck(deckFiles []string, playerID int, labels, date string, draftID int) (*types.Deck, error) {
	// Go through each file, and parse it. We allow multiple files
	// to be specified, in case a deck is split across multiple files - namely, a mainboard and
	// sideboard file.
	cardSets := [][]types.Card{}
	for _, f := range deckFiles {
		mb, sb, err := cardsFromDeckFile(f)
		if err != nil {
			return nil, err
		}

		cardSets = append(cardSets, mb)
		if len(sb) > 0 {
			cardSets = append(cardSets, sb)
		}
	}

	if len(cardSets) == 0 {
		return nil, fmt.Errorf("No cards found in deck files: %v", deckFiles)
	}
	if len(cardSets) > 2 {
		return nil, fmt.Errorf("Too many card sets (%d) found in deck files: %v", len(cardSets), deckFiles)
	}

	// Build the deck struct. Macro archetype values (aggro/midrange/control)
	// passed through --labels are auto-promoted to the dedicated field so callers
	// don't need to keep them in sync.
	d := types.NewDeck()
	if len(labels) > 0 {
		for _, l := range strings.Split(labels, ",") {
			l = strings.TrimSpace(l)
			switch strings.ToLower(l) {
			case "aggro", "midrange", "control":
				d.MacroArchetype = strings.ToLower(l)
			default:
				d.Labels = append(d.Labels, l)
			}
		}
	}
	d.PlayerID = playerID
	d.Date = date
	d.Metadata.DraftID = draftID

	// Add the cards to the deck. We assume the longer list is the mainboard.
	// TODO: This is pretty janky.
	if len(deckFiles) == 1 {
		if len(cardSets[0]) >= 45 {
			// If thre is only a single card set, and it is exactly 45 cards, assume it is the draft pool
			// and not a mainboard + sideboard.
			d.Pool = cardSets[0]
			d.Metadata.PoolFile = deckFiles[0]
			return d, nil
		}

		// Otherwise, assume it is a mainboard, with an optional sideboard.
		d.Mainboard = cardSets[0]
		if len(cardSets) > 1 {
			d.Sideboard = cardSets[1]
		}
		d.Metadata.CombinedFile = deckFiles[0]
	} else if len(deckFiles) == 2 {
		if len(cardSets[0]) >= len(cardSets[1]) {
			d.Mainboard = cardSets[0]
			d.Sideboard = cardSets[1]
			d.Metadata.MainboardFile = deckFiles[0]
			d.Metadata.SideboardFile = deckFiles[1]
		} else {
			d.Mainboard = cardSets[1]
			d.Sideboard = cardSets[0]
			d.Metadata.MainboardFile = deckFiles[1]
			d.Metadata.SideboardFile = deckFiles[0]
		}
	}

	// Make sure the mainboard and sideboard are not the same, as that's weird!
	if !cardSetsDiffer(d.Mainboard, d.Sideboard) {
		return nil, fmt.Errorf("Mainboard and sideboard are the same: %v", deckFiles)
	}

	// If a deck has less than 40 cards in the mainboard, that likely indicates a
	// scan error or a deck that was not properly built.
	if len(d.Mainboard) < 40 {
		logrus.WithFields(logrus.Fields{
			"files":     deckFiles,
			"mainboard": len(d.Mainboard),
		}).Warn("Deck has less than 40 cards in the mainboard, likely a scan error or incomplete deck.")
	}

	if d.PickCount() != 45 {
		logrus.WithFields(logrus.Fields{
			"files": deckFiles,
			"count": d.PickCount(),
		}).Warn("Deck does not have 45 cards total (main + side), likely a scan error, incomplete deck, or unusual draft format.")
	}
	return d, nil
}

// cardSetsDiffer returns true if the two slices of cards are not equal, ignoring order.
func cardSetsDiffer(a, b []types.Card) bool {
	if len(a) != len(b) {
		return true
	}
	m := make(map[string]int)
	for _, c := range a {
		m[c.Name]++
	}
	for _, c := range b {
		m[c.Name]--
	}
	for _, v := range m {
		if v != 0 {
			return true
		}
	}
	return false
}

// ParseDeckBytes parses an in-memory decklist. format is ".txt" (draftmancer
// style, "<count> <name>" per line, a blank line splitting mainboard from
// sideboard) or ".csv" (Delver Lens / CubeCobra export). It returns the
// mainboard and sideboard card lists.
func ParseDeckBytes(data []byte, format string) (mainboard, sideboard []types.Card, err error) {
	switch format {
	case ".txt":
		mb, sb := cardsFromTXTBytes(data)
		return mb, sb, nil
	case ".csv":
		return cardsFromCSVBytes(data)
	default:
		return nil, nil, fmt.Errorf("unsupported deck format: %q", format)
	}
}

func cardsFromDeckFile(deckFile string) ([]types.Card, []types.Card, error) {
	var mb, sb []types.Card
	if strings.HasSuffix(deckFile, ".csv") {
		var err error
		mb, sb, err = cardsFromCSV(deckFile)
		if err != nil {
			return nil, nil, err
		}
	} else if strings.HasSuffix(deckFile, ".txt") {
		mb, sb = cardsFromTXT(deckFile)
	} else {
		return nil, nil, fmt.Errorf("Unsupported file type: %s", deckFile)
	}
	return mb, sb, nil
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
	copyOrKeep := func(src, suffix, label string) string {
		if src == "" {
			return ""
		}
		dst, err := draft.CopySource(src, d.ID, suffix)
		if err != nil {
			logc.WithError(err).Warnf("Failed to copy %s file", label)
		}
		return dst
	}
	d.Metadata.CombinedFile = copyOrKeep(d.Metadata.CombinedFile, "", "source")
	d.Metadata.MainboardFile = copyOrKeep(d.Metadata.MainboardFile, "-mainboard", "mainboard")
	d.Metadata.SideboardFile = copyOrKeep(d.Metadata.SideboardFile, "-sideboard", "sideboard")
	d.Metadata.PoolFile = copyOrKeep(d.Metadata.PoolFile, "-pool", "pool")

	// Write the canonical deck file in our format. The JSON is the source of
	// truth - the `export-cc` command handles cubecobra exports on demand, so
	// we no longer write a per-deck .cubecobra.txt alongside.
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
// Newlines used to separate mainboard and sideboard.
func cardsFromTXT(txt string) ([]types.Card, []types.Card) {
	f, err := os.Open(txt)
	defer f.Close()
	if err != nil {
		panic(err)
	}
	b, err := io.ReadAll(f)
	if err != nil {
		panic(err)
	}
	return cardsFromTXTBytes(b)
}

// cardsFromTXTBytes is the byte-based core of cardsFromTXT.
func cardsFromTXTBytes(b []byte) ([]types.Card, []types.Card) {
	// Add in cards.
	lines := strings.Split(string(b), "\n")

	mainboard := true
	sawCard := false
	flipped := false

	// The first character is always the number.
	mb := []types.Card{}
	sb := []types.Card{}
	for _, l := range lines {
		if len(l) == 0 {
			// Blank line marks the mainboard/sideboard divider. Skip leading
			// blanks (before any card) and treat consecutive blanks as one
			// divider — only the first blank after content flips the section.
			if sawCard && !flipped {
				mainboard = false
				flipped = true
			}
			continue
		}
		sawCard = true

		// Default to a single entry if no number is specified.
		var count int64
		var err error
		var name string
		splits := strings.SplitN(l, " ", 2)
		count, err = strconv.ParseInt(splits[0], 10, 32)
		if err != nil {
			// The whole line is the name, and we default to a count of 1.
			name = l
			count = 1
		} else {
			// First part is the count, second part is the name.
			name = splits[1]
		}

		for i := 0; i < int(count); i++ {
			oracleData := types.GetOracleData(name)
			if oracleData.Name == "" {
				logrus.Errorf("Failed to find oracle data for: %s", name)
				continue
			}
			if mainboard {
				mb = append(mb, types.FromOracle(oracleData))
			} else {
				sb = append(sb, types.FromOracle(oracleData))
			}

		}
	}
	return mb, sb
}

func cardsFromCSV(path string) ([]types.Card, []types.Card, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()

	b, err := io.ReadAll(f)
	if err != nil {
		return nil, nil, err
	}
	return cardsFromCSVBytes(b)
}

// cardsFromCSVBytes is the byte-based core of cardsFromCSV.
func cardsFromCSVBytes(b []byte) ([]types.Card, []types.Card, error) {
	r := csv.NewReader(bytes.NewReader(b))
	r.FieldsPerRecord = -1 // tolerate variable column counts (e.g. "Sideboard" rows)
	records, err := r.ReadAll()
	if err != nil {
		return nil, nil, err
	}
	if len(records) == 0 {
		return nil, nil, nil
	}

	// First row is the header. CubeCobra exports have one row per card (no
	// Quantity/Count column) and a "maybeboard" column marking cards that
	// aren't actually in the cube.
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

	mb := []types.Card{}
	sb := []types.Card{}
	sideboard := false
	for _, row := range records[1:] {
		if len(row) == 0 {
			continue
		}
		// A "Sideboard" marker can appear as a single-column row.
		if len(row) == 1 && strings.EqualFold(strings.TrimSpace(row[0]), "Sideboard") {
			sideboard = true
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

		for i := 0; i < count; i++ {
			oracleData := types.GetOracleData(name)
			if oracleData.Name == "" {
				logrus.Errorf("Failed to find oracle data for: %s", name)
				continue
			}
			if sideboard || maybeboard {
				sb = append(sb, types.FromOracle(oracleData))
			} else {
				mb = append(mb, types.FromOracle(oracleData))
			}
		}
	}
	return mb, sb, nil
}
