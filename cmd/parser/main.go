package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

var (
	// User input.

	// Mutually exclusive options for specifying a file or files
	// to parse.
	deck     string
	deckDir  string
	draftLog string

	// Configures the deck file extension to look for.
	fileType string

	// Options applicable when parsing a single deck file.
	labels string
	who    string
	date   string

	// If set, runs in index mode which indexes
	// the data set.
	reindex bool

	// Calculated internal state.
	outdir string
)

func init() {
	flag.StringVar(&deck, "deck", "", "Path to the deck file to import")
	flag.StringVar(&draftLog, "draft-log", "", "Path to a draft log to parse. NOTE: Basic lands not included!")
	flag.StringVar(&who, "who", "", "Who made the deck")
	flag.StringVar(&labels, "labels", "", "Labels describing the deck. e.g., aggro,sacrifice")
	flag.StringVar(&date, "date", "", "Date, in YYYY-MM-DD format")
	flag.StringVar(&deckDir, "deck-dir", "", "Directory containing deck files to parse. Alternative to -deck.")
	flag.StringVar(&fileType, "filetype", ".csv", "File type to look for in the deck-dir.")

	flag.BoolVar(&reindex, "index", false, "Create index files for the drafts directory")
}

func main() {
	// Parser parses a text representation of a deck and turns it into a Deck compatible
	// with the rest of the tooling in this repository.
	parseFlags()

	if reindex {
		index()
	} else if draftLog != "" {
		// Parse a draft log.
		parseDraftLog()
	} else {
		// Parse a single file or directory of files.
		parseFiles()
	}
}

func index() {
	// Specify the directory that holds the drafts.
	directory := "./drafts"

	// Get a list of sub-directories in the directory
	// each subdir represents a draft.
	subDirs, err := getSubDirectories(directory)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	// Create a slice to store the maps
	var dirs []map[string]string

	// Iterate over the sub-directories and create maps
	for _, dir := range subDirs {
		// Create a map with "name" as the key and the directory name as the value
		dirMap := map[string]string{
			"name": dir,
		}

		dirs = append(dirs, dirMap)
	}

	// Create the index file
	indexFile := filepath.Join(directory, "index.json")

	// Create and open the file for writing
	file, err := os.Create(indexFile)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer file.Close()

	// Encode the directories to JSON
	fileData, err := json.MarshalIndent(dirs, "", " ")
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	// Write the JSON data to the file
	_, err = file.Write(fileData)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	// For each draft, we should also index the decks within it.
	for _, draft := range dirs {
		indexDraft("drafts/" + draft["name"])
	}

	// As part of re-indexing, parse the cube.csv and convert it to json so
	// that it's more easily read by the UI code.
	cards, _ := cardsFromCSV("cube.csv")
	cube := types.Cube{Cards: cards}
	bytes, err := json.MarshalIndent(cube, "", " ")
	if err != nil {
		panic(err)
	}
	err = os.WriteFile("cube.json", bytes, os.ModePerm)
	if err != nil {
		panic(err)
	}

	fmt.Println("Finished indexing all drafts")
}

func indexDraft(directory string) {
	// Get a list of all JSON files in the directory
	jsonFiles, err := filepath.Glob(filepath.Join(directory, "*.json"))
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	// Create a slice to store the maps
	var decks []map[string]string

	// Iterate over the JSON files and create maps
	for _, file := range jsonFiles {
		// Get only the base name of the file
		fileName := filepath.Base(file)

		// Skip index.json and cube snapshot files.
		if fileName == "index.json" {
			continue
		}
		if strings.Contains(file, "snapshot") {
			continue
		}
		if strings.Contains(file, "draft-log") {
			continue
		}

		// Create a map with "deck" as the key and the file name as the value
		deck := map[string]string{
			"deck": fileName,
		}

		decks = append(decks, deck)
	}

	// Create the index file
	indexFile := filepath.Join(directory, "index.json")

	// Create and open the file for writing
	file, err := os.Create(indexFile)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer file.Close()

	// Encode the decks to JSON
	fileData, err := json.MarshalIndent(decks, "", " ")
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	// Write the JSON data to the file
	_, err = file.Write(fileData)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	fmt.Println(fmt.Sprintf("%s/index.json created", directory))
}

func parseFiles() {
	// Make sure the output directory exists.
	err := os.MkdirAll(outdir, os.ModePerm)
	if err != nil {
		panic(err)
	}

	type work struct {
		player string
		path   string
	}

	// Gather files to load.
	files := []work{}
	if deck != "" {
		files = append(files, work{player: who, path: deck})
	} else {
		// Load files from CSV dir.
		fileNames, err := os.ReadDir(deckDir)
		if err != nil {
			panic(err)
		}
		for _, f := range fileNames {
			// Skip some well-known files that we never want to process.
			if strings.Contains(f.Name(), "cubecobra.txt") {
				// These are generated by this tool and should just be skipped.
				continue
			}
			if strings.HasSuffix(f.Name(), fileType) {
				// Add the file, using the file name as the player name (minus the filetype)
				files = append(files, work{
					player: strings.Split(f.Name(), ".")[0],
					path:   fmt.Sprintf("%s/%s", deckDir, f.Name()),
				})
			}
		}
	}
	fmt.Printf("Processing file(s): %s\n", files)

	// Determine if we need to auto-name the file.
	for _, f := range files {
		d, err := loadDeckFile(f.path, f.player)
		if err != nil {
			panic(err)
		}

		// For each card in the draft pool, add up how many times it appeared in game replays.
		// This can help us approximate the impact of a particular card in a deck.
		draftDir := fmt.Sprintf("drafts/%s", date)
		if _, err = os.Stat(fmt.Sprintf("%s/replays", draftDir)); err == nil {
			for ii := range d.Mainboard {
				d.Mainboard[ii].Appearances = cardAppearances(d.Mainboard[ii], draftDir)
			}
			for ii := range d.Sideboard {
				d.Sideboard[ii].Appearances = cardAppearances(d.Sideboard[ii], draftDir)
			}
		}

		// Write the deck for storage.
		writeDeck(d, f.path, f.player)
	}

	snaptshotFilename := fmt.Sprintf("%s/cube-snapshot.json", outdir)
	if _, err := os.Stat(snaptshotFilename); err != nil {
		// Write the cube-snapshot file to the draft directory if it doesn't exist already.
		//
		// This ensures we have a snapshot of the cube as it was on this date
		// for historical tracking and comparisons.
		// TODO: This is a bit of a hack, and assumes this command is being run
		// within the root of this project. That's OK for now since I am the only user.
		cmd := exec.Command("cp", "cube.json", snaptshotFilename)
		if err := cmd.Run(); err != nil {
			panic(err)
		}
	}
}

// cardAppearences returns the number of times the given card is referenced in
// the replays from the given draft.
func cardAppearances(card types.Card, draft string) int {
	// If the card is a split card, we only want to count the first half.
	cardName := strings.TrimSpace(strings.Split(card.Name, " // ")[0])
	out, err := exec.Command("grep", "-r", cardName, fmt.Sprintf("%s/replays", draft)).Output()
	if err != nil {
		fmt.Printf("Error determining appearances for card '%s': %s\n", cardName, err)
		return 0
	}
	return len(strings.Split(strings.TrimSpace(string(out)), "\n"))
}

func parseDraftLog() {
	// Make sure the output directory exists.
	err := os.MkdirAll(outdir, os.ModePerm)
	if err != nil {
		panic(err)
	}

	fmt.Printf("Processing draft log: %s\n", draftLog)

	log := loadDraftLog(draftLog)

	// Determine if we need to auto-name the file.
	for _, d := range decksFromDraftLog(log) {
		// Write the deck for storage.
		writeDeck(&d, "", d.Player)
	}
}

func parseFlags() error {
	flag.Parse()
	if !reindex {
		if date == "" {
			panic(fmt.Errorf("Missing required flag: -date"))
		}
		if deck == "" && deckDir == "" && draftLog == "" {
			panic(fmt.Errorf("Missing required flag: -deck, -deck-dir, or -draft-log"))
		}
		if deck != "" && who == "" {
			panic(fmt.Errorf("Missing required flag: -who"))
		}
		outdir = fmt.Sprintf("drafts/%s", date)
	}
	return nil
}

func loadDeckFile(deckFile string, player string) (*types.Deck, error) {
	// Build the deck struct.
	d := types.NewDeck()

	// Get the cards from the file.
	if strings.HasSuffix(deckFile, ".csv") {
		d.Mainboard, d.Sideboard = cardsFromCSV(deckFile)
	} else if strings.HasSuffix(deckFile, ".txt") {
		d.Mainboard, d.Sideboard = cardsFromTXT(deckFile)
	}

	// Add other metadata.
	if len(labels) > 0 {
		d.Labels = strings.Split(labels, ",")
	}
	d.Player = player
	d.Date = date

	return d, nil
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
				fmt.Printf("=== ERROR: Failed to find oracle data for: %s ===\n", name)
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

func cardsFromLine(line string, quantityIdx, nameIdx int) []types.Card {
	cards := []types.Card{}
	count, name := parseLine(line, quantityIdx, nameIdx)
	for i := 0; i < count; i++ {
		oracleData := types.GetOracleData(name)
		if oracleData.Name == "" {
			fmt.Printf("=== ERROR: Failed to find oracle data for: %s ===\n", name)
			continue
		}
		cards = append(cards, types.FromOracle(oracleData))
	}
	return cards
}

func loadDeckFromFile(filename string) *types.Deck {
	f, err := os.Open(filename)
	defer f.Close()
	if err != nil {
		panic(err)
	}

	bytes, err := io.ReadAll(f)
	if err != nil {
		panic(err)
	}
	deck := types.Deck{}
	json.Unmarshal(bytes, &deck)
	return &deck
}

func writeDeck(d *types.Deck, srcFile string, player string) error {
	fmt.Printf("Writing deck for player %s in %s\n", player, outdir)

	// If the file already exists, load it and save some fields.
	// This allows us to re-run this script without overwriting manually
	// captured metadata.
	fn := fmt.Sprintf("%s/%s.json", outdir, player)
	if _, err := os.Stat(fn); err == nil {
		fmt.Printf("File already exists, loading and updating: %s\n", fn)
		existing := loadDeckFromFile(fn)
		if err != nil {
			panic(err)
		}
		d.Labels = existing.Labels
		d.Games = existing.Games
		d.Wins = existing.Wins
		d.Losses = existing.Losses
	}

	// First, write the canonical deck file in our format.
	bs, err := json.MarshalIndent(d, "", " ")
	if err != nil {
		panic(err)
	}

	// Write the parsed deck.
	fmt.Printf("Writing parsed file: %s\n", fn)
	err = os.WriteFile(fn, bs, os.ModePerm)
	if err != nil {
		panic(err)
	}

	// Also write the original "raw" decklist for posterity.
	if srcFile != "" {
		fmt.Printf("Writing source file: %s\n", srcFile)
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
	fmt.Printf("Writing kubecobra file")
	f2, err := os.Create(fmt.Sprintf("%s/%s.cubecobra.txt", outdir, player))
	defer f2.Close()
	if err != nil {
		panic(err)
	}
	for _, c := range d.Mainboard {
		f2.Write([]byte(c.Name))
		f2.Write([]byte("\n"))
	}
	return nil
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

// getSubDirectories returns a list of sub-directories in the given directory
func getSubDirectories(directory string) ([]string, error) {
	// Read the directory content
	files, err := os.ReadDir(directory)
	if err != nil {
		return nil, err
	}

	// Create a slice to store the sub-directory names
	var subDirs []string

	// Iterate over the directory content
	for _, file := range files {
		if file.IsDir() {
			subDirs = append(subDirs, file.Name())
		}
	}

	return subDirs, nil
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

func decksFromDraftLog(log *types.DraftLog) []types.Deck {
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
