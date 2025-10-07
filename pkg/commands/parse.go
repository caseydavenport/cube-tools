package commands

import (
	"fmt"
	"io"
	"os"
	"os/exec"
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
		d, err := parseDeck([]string{deckInput}, who, labels, date, draftID)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to parse deck")
		}
		// Write the deck for storage.
		if err := writeDeck(d, draftID); err != nil {
			logrus.WithError(err).Fatal("Failed to write deck")
		}
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

// parseDeck parses a single deck file and writes the output to the given directory.
func parseDeck(deckFiles []string, who, labels, date, draftID string) (*types.Deck, error) {
	// Go through each file, and parse it. We allow multiple files
	// to be specified, in case a deck is split across multiple files - namely, a mainboard and
	// sideboard file.
	cardSets := make([][]types.Card, 0, len(deckFiles))
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
		return nil, fmt.Errorf("Too many card sets found in deck files: %v", deckFiles)
	}

	// Build the deck struct.
	d := types.NewDeck()
	if len(labels) > 0 {
		d.Labels = strings.Split(labels, ",")
	}
	d.Player = who
	d.Date = date
	d.Metadata.DraftID = draftID

	// Add the cards to the deck. We assume the longer list is the mainboard.
	// TODO: This is pretty janky.
	if len(deckFiles) == 1 {
		if len(cardSets[0]) == 45 {
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

	// For each card in the draft pool, add up how many times it appeared in game replays.
	// This can help us approximate the impact of a particular card in a deck.
	var err error
	draftDir := fmt.Sprintf("data/polyverse/%s", draftID)
	if _, err = os.Stat(fmt.Sprintf("%s/replays", draftDir)); err == nil {
		for ii := range d.Mainboard {
			d.Mainboard[ii].Appearances = cardAppearances(d.Mainboard[ii], draftDir)
		}
		for ii := range d.Sideboard {
			d.Sideboard[ii].Appearances = cardAppearances(d.Sideboard[ii], draftDir)
		}
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

func cardsFromDeckFile(deckFile string) ([]types.Card, []types.Card, error) {
	var mb, sb []types.Card
	if strings.HasSuffix(deckFile, ".csv") {
		mb, sb = cardsFromCSV(deckFile)
	} else if strings.HasSuffix(deckFile, ".txt") {
		mb, sb = cardsFromTXT(deckFile)
	} else {
		return nil, nil, fmt.Errorf("Unsupported file type: %s", deckFile)
	}
	return mb, sb, nil
}

func writeDeck(d *types.Deck, draftID string) error {
	// Make sure the output directory exists.
	outdir := fmt.Sprintf("data/polyverse/%s", draftID)
	err := os.MkdirAll(outdir, os.ModePerm)
	if err != nil {
		return fmt.Errorf("Failed to create output directory: %w", err)
	}

	if len(d.Player) == 0 {
		return fmt.Errorf("Player name is required to write deck")
	}
	if len(draftID) == 0 {
		return fmt.Errorf("Draft ID is required to write deck")
	}

	// Generate the filename for the deck.
	path := d.Metadata.Path
	if path == "" {
		path = fmt.Sprintf("%s/%s.json", outdir, strings.ToLower(d.Player))
	}

	// Ensure the correct metadata is set on the deck.
	d.Metadata.DraftID = draftID
	d.Metadata.Path = path

	// If the file already exists, load it and save some fields.
	// This allows us to re-run this script without overwriting manually
	// captured metadata.
	if _, err := os.Stat(path); err == nil {
		logrus.WithField("file", path).Debug("File already exists, loading and updating")
		existing := LoadParsedDeckFile(draftID, d.Player)
		d.Player = existing.Player
		d.Labels = existing.Labels
		d.Matches = existing.Matches
		d.Games = existing.Games
		d.Wins = existing.Wins
		d.Losses = existing.Losses

		logrus.WithFields(logrus.Fields{
			"games":   d.Games,
			"matches": d.Matches,
		}).Info("Preserved existing game/match data")
	}

	// Ensure capitalization is consistent for player names (all lowercase).
	d.Player = strings.ToLower(d.Player)
	for i := range d.Games {
		d.Games[i].Opponent = strings.ToLower(d.Games[i].Opponent)
		d.Games[i].Winner = strings.ToLower(d.Games[i].Winner)
	}
	for i := range d.Matches {
		d.Matches[i].Opponent = strings.ToLower(d.Matches[i].Opponent)
		d.Matches[i].Winner = strings.ToLower(d.Matches[i].Winner)
	}

	logc := logrus.WithFields(logrus.Fields{
		"player": d.Player,
		"outdir": outdir,
		"count":  d.PickCount(),
	})
	logc.Infof("Writing deck")

	// Write the original "raw" decklist for posterity, tracking source files.
	if f := d.Metadata.CombinedFile; f != "" {
		filename := fmt.Sprintf("%s%s", d.Player, fileSuffix(f))
		dst := fmt.Sprintf("%s/%s", outdir, filename)
		if err := copyFile(*logc, f, dst); err != nil {
			logc.WithError(err).Warn("Failed to copy source file")
		}
	}
	if f := d.Metadata.MainboardFile; f != "" {
		filename := fmt.Sprintf("%s-mainboard%s", d.Player, fileSuffix(f))
		dst := fmt.Sprintf("%s/%s", outdir, filename)
		if err := copyFile(*logc, f, dst); err != nil {
			logc.WithError(err).Warn("Failed to copy mainboard file")
		}
	}
	if f := d.Metadata.SideboardFile; f != "" {
		filename := fmt.Sprintf("%s-sideboard%s", d.Player, fileSuffix(f))
		dst := fmt.Sprintf("%s/%s", outdir, filename)
		if err := copyFile(*logc, f, dst); err != nil {
			logc.WithError(err).Warn("Failed to copy sideboard file")
		}
	}

	// First, write the canonical deck file in our format.
	logc.WithField("file", path).Debug("Writing canonical deck file")
	if err := SaveDeck(d); err != nil {
		logrus.WithError(err).Fatal("Failed to save deck")
	}

	// Write it out as a simple text file with one card per line - useful to importing into cubecobra
	// and other tools that accept decklists.
	fileName := fmt.Sprintf("%s/%s.cubecobra.txt", outdir, d.Player)
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

func copyFile(logc logrus.Entry, src, dst string) error {
	logc.WithField("file", src).Debugf("Writing source file for posterity")
	f, err := os.Open(src)
	defer f.Close()
	if err != nil {
		panic(err)
	}
	bytes, err := io.ReadAll(f)
	if err != nil {
		panic(err)
	}
	return os.WriteFile(dst, bytes, os.ModePerm)
}

func fileSuffix(f string) string {
	if strings.HasSuffix(f, ".txt") {
		return ".txt"
	} else if strings.HasSuffix(f, ".csv") {
		return ".csv"
	}
	return ""
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
