package commands

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"

	"github.com/spf13/cobra"
)

var (
	// deckInput is the path to the deck file to parse.
	deckInput string
	labels    string
	who       string
	date      string

	// draftID is the ID of the draft to which this deck belongs. It
	// is used to determine the output directory for generated files.
	draftID string

	// deckInputDir is the path to the directory containing deck files to parse.
	deckInputDir string

	// prefix and fileType are used to determine which files within the deckInputDir to parse.
	prefix   string
	fileType string

	// draftLog is the path to the draft log file.
	draftLog string
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
		if date == "" {
			logrus.Fatal("Must specify a date for the deck.")
		}
		if _, err := time.Parse("2006-01-02", date); err != nil {
			logrus.Fatalf("Invalid date format: %s. Must be YYYY-MM-DD.", date)
		}
		if who == "" {
			logrus.Fatal("Must specify a player name.")
		}
		if draftID == "" {
			logrus.Fatal("Must specify a draft ID.")
		}

		// Parse the deck.
		parseSingleDeck(deckInput, who, labels, date, draftID)
	},
}

func init() {
	// Add flags for the command to parse a single deck.
	flags := ParseCmd.Flags()
	flag.StringVarP(flags, &deckInput, "deck", "d", "DECK", "", "Path to the deck file to import")
	flag.StringVarP(flags, &who, "who", "w", "WHO", "", "Who made the deck")
	flag.StringVarP(flags, &labels, "labels", "l", "LABELS", "", "Labels describing the deck. e.g., aggro,sacrifice")
	flag.StringVarP(flags, &date, "date", "t", "DATE", "", "Date, in YYYY-MM-DD format")
	flag.StringVarP(flags, &draftID, "draft", "", "DRAFT", "", "Draft ID - used as the output directory")
}

// parseSingleDeck parses a single deck file and writes the output to the given directory.
func parseSingleDeck(deck, who, labels, date, draftID string) error {
	// Parse the file.
	d, err := parseRawDeckFile(deck, who, labels, date, draftID)
	if err != nil {
		return err
	}

	// For each card in the draft pool, add up how many times it appeared in game replays.
	// This can help us approximate the impact of a particular card in a deck.
	draftDir := fmt.Sprintf("data/polyverse/%s", draftID)
	if _, err = os.Stat(fmt.Sprintf("%s/replays", draftDir)); err == nil {
		for ii := range d.Mainboard {
			d.Mainboard[ii].Appearances = cardAppearances(d.Mainboard[ii], draftDir)
		}
		for ii := range d.Sideboard {
			d.Sideboard[ii].Appearances = cardAppearances(d.Sideboard[ii], draftDir)
		}
	}

	// Write the deck for storage.
	if err := writeDeck(d, deck, who, draftID); err != nil {
		return err
	}
	return nil
}

// parseRawDeckFile parses a raw input deck file and returns a Deck struct.
func parseRawDeckFile(deckFile, player, labels, date, draftID string) (*types.Deck, error) {
	// Build the deck struct.
	d := types.NewDeck()

	// Get the cards from the file.
	if strings.HasSuffix(deckFile, ".csv") {
		d.Mainboard, d.Sideboard = cardsFromCSV(deckFile)
	} else if strings.HasSuffix(deckFile, ".txt") {
		d.Mainboard, d.Sideboard = cardsFromTXT(deckFile)
	} else {
		return nil, fmt.Errorf("Unsupported file type: %s", deckFile)
	}

	// Add other metadata.
	if len(labels) > 0 {
		d.Labels = strings.Split(labels, ",")
	}
	d.Player = player
	d.Date = date
	d.Metadata.DraftID = draftID
	d.Metadata.SourceFile = filepath.Base(deckFile)

	return d, nil
}

func writeDeck(d *types.Deck, srcFile string, player string, draftID string) error {
	// Force lowercase player names for consistency.
	player = strings.ToLower(player)

	// Make sure the output directory exists.
	outdir := fmt.Sprintf("data/polyverse/%s", draftID)
	err := os.MkdirAll(outdir, os.ModePerm)
	if err != nil {
		panic(err)
	}

	if len(player) == 0 {
		return fmt.Errorf("Player name is required to write deck")
	}
	if len(draftID) == 0 {
		return fmt.Errorf("Draft ID is required to write deck")
	}

	// Generate the filename for the deck.
	path := fmt.Sprintf("%s/%s.json", outdir, player)

	// Ensure the correct metadata is set on the deck.
	d.Metadata.DraftID = draftID
	d.Metadata.Path = path

	// If the file already exists, load it and save some fields.
	// This allows us to re-run this script without overwriting manually
	// captured metadata.
	if _, err := os.Stat(path); err == nil {
		logrus.WithField("file", path).Debug("File already exists, loading and updating")
		existing := LoadParsedDeckFile(draftID, player)
		d.Player = existing.Player
		d.Labels = existing.Labels
		d.Matches = existing.Matches
		d.Games = existing.Games
		d.Wins = existing.Wins
		d.Losses = existing.Losses
	}

	logc := logrus.WithFields(logrus.Fields{
		"player": player,
		"outdir": outdir,
	})
	logc.Infof("Writing deck")

	// First, write the canonical deck file in our format.
	logc.WithField("file", path).Debug("Writing canonical deck file")
	if err := SaveDeck(d); err != nil {
		logrus.WithError(err).Fatal("Failed to save deck")
	}

	// Also write the original "raw" decklist for posterity.
	if srcFile != "" {
		logc.WithField("file", srcFile).Debugf("Writing source file for posterity")
		f, err := os.Open(srcFile)
		defer f.Close()
		if err != nil {
			panic(err)
		}
		bytes, err := io.ReadAll(f)
		if err != nil {
			panic(err)
		}

		suffix := ".csv"
		if strings.HasSuffix(srcFile, ".txt") {
			suffix = ".txt"
		}
		err = os.WriteFile(fmt.Sprintf("%s/%s%s", outdir, player, suffix), bytes, os.ModePerm)
		if err != nil {
			panic(err)
		}
	}

	// Write it out as a simple text file with one card per line - useful to importing into cubecobra
	// and other tools that accept decklists.
	fileName := fmt.Sprintf("%s/%s.cubecobra.txt", outdir, player)
	logc.WithField("file", fileName).Debug("Writing kubecobra formatted file")
	f2, err := os.Create(fileName)
	defer f2.Close()
	if err != nil {
		logc.WithError(err).Fatal("Failed to create file")
	}
	for _, c := range d.Mainboard {
		f2.Write([]byte(c.Name))
		f2.Write([]byte("\n"))
	}
	return nil
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
	bytes, err := io.ReadAll(f)
	if err != nil {
		panic(err)
	}

	// Add in cards.
	lines := strings.Split(string(bytes), "\n")

	mainboard := true

	// The first character is always the number.
	mb := []types.Card{}
	sb := []types.Card{}
	for _, l := range lines {
		if len(l) == 0 {
			mainboard = false
			continue
		}
		splits := strings.SplitN(l, " ", 2)
		count, err := strconv.ParseInt(splits[0], 10, 32)
		if err != nil {
			panic(fmt.Errorf("Error parsing %s as int: %s", splits[0], err))
		}
		name := splits[1]
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

func cardsFromCSV(csv string) ([]types.Card, []types.Card) {
	f, err := os.Open(csv)
	defer f.Close()
	if err != nil {
		panic(err)
	}
	bytes, err := io.ReadAll(f)
	if err != nil {
		panic(err)
	}

	// Add in cards.
	lines := strings.Split(string(bytes), "\n")

	// Use the first line to determine which indices have the quanity
	// and card name.
	quantityIdx := -1
	nameIdx := -1
	for i, header := range strings.Split(lines[0], ",") {
		if strings.EqualFold(header, "Quantity") || strings.EqualFold(header, "Count") {
			quantityIdx = i
		}
		if strings.EqualFold(header, "Name") {
			nameIdx = i
		}
	}
	if quantityIdx < 0 || nameIdx < 0 {
		panic("Failed to find quanity / name indices")
	}

	// Now go through each line and extract the card, skipping the first line
	// which only contains the header.
	mb := []types.Card{}
	sb := []types.Card{}
	sideboard := false
	for _, l := range lines[1:] {
		if len(l) == 0 {
			continue
		}
		if strings.Contains(l, "Sideboard") || strings.Contains(l, "sideboard") {
			sideboard = true
			continue
		}
		parsed := cardsFromLine(l, quantityIdx, nameIdx)

		if sideboard {
			sb = append(sb, parsed...)
		} else {
			mb = append(mb, parsed...)
		}
	}
	return mb, sb
}

func cardsFromLine(line string, quantityIdx, nameIdx int) []types.Card {
	cards := []types.Card{}
	count, name := parseLine(line, quantityIdx, nameIdx)
	for i := 0; i < count; i++ {
		oracleData := types.GetOracleData(name)
		if oracleData.Name == "" {
			logrus.Errorf("Failed to find oracle data for: %s", name)
			continue
		}
		cards = append(cards, types.FromOracle(oracleData))
	}
	return cards
}

func parseLine(l string, qIdx, nIdx int) (int, string) {
	// Lines are generally formatted like this:
	// Deck lists: "1,","card, name"
	// Cube list: 1,"card, name",main
	//
	// So, we need to be able to handle card names with commas in them!

	// For now, this is a bit of a hack. Ideally we'd parse this more intelligently, but
	// since we know what limited inputs we might see here we can just cut off this suffix.
	// We don't need to build a fully functional CSV parser.
	l = strings.TrimSuffix(l, ",main")

	// Parse the line. There should only be two columns. Each column's value may or may not
	// be wrapped in quotes.
	splits := strings.SplitN(l, ",", 2)
	count, err := strconv.ParseInt(strings.Trim(splits[qIdx], "\""), 10, 32)
	if err != nil {
		panic(fmt.Errorf("Error parsing line: %s: %s", l, err))
	}
	name := strings.Trim(splits[nIdx], "\"")
	return int(count), name
}

// cardAppearences returns the number of times the given card is referenced in
// the replays from the given draft.
func cardAppearances(card types.Card, draft string) int {
	// Check if there is a replays directory. If not, we can't determine appearances.
	if _, err := os.Stat(fmt.Sprintf("%s/replays", draft)); err != nil {
		logrus.Debug("No replays directory found. Skipping card appearance count.")
		return 0
	}

	// If the card is a split card, we only want to count the first half.
	cardName := strings.TrimSpace(strings.Split(card.Name, " // ")[0])
	out, err := exec.Command("grep", "-r", cardName, fmt.Sprintf("%s/replays", draft)).Output()
	if err != nil {
		return 0
	}
	return len(strings.Split(strings.TrimSpace(string(out)), "\n"))
}
