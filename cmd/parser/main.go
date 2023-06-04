package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"os"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

var (
	// User input.
	deck   string
	wins   int
	losses int
	labels string
	who    string
	date   string

	// Calculated internal state.
	outdir string
)

func init() {
	flag.StringVar(&deck, "deck", "", "Path to the deck file to import")
	flag.StringVar(&who, "who", "", "Who made the deck")
	flag.IntVar(&wins, "wins", 0, "Number of wins")
	flag.IntVar(&losses, "losses", 0, "Number of losses")
	flag.StringVar(&labels, "labels", "", "Labels describing the deck. e.g., aggro,sacrifice")
	flag.StringVar(&date, "date", "", "Date, in YYYY-MM-DD format")
}

func main() {
	// Parser parses a text representation of a deck and turns it into a Deck compatible
	// with the rest of the tooling in this repository.
	parseFlags()
	d, err := loadFile()
	if err != nil {
		panic(err)
	}

	// Make sure the output directory exists.
	err = os.MkdirAll(outdir, os.ModePerm)
	if err != nil {
		panic(err)
	}

	// Write the deck for storage.
	writeDeck(d)
}

func parseFlags() error {
	flag.Parse()
	if date == "" {
		panic(fmt.Errorf("Missing required flag: -date"))
	}
	if deck == "" {
		panic(fmt.Errorf("Missing required flag: -deck"))
	}
	if who == "" {
		panic(fmt.Errorf("Missing required flag: -who"))
	}
	outdir = fmt.Sprintf("drafts/%s", date)
	return nil
}

func loadFile() (*types.Deck, error) {
	f, err := os.Open(deck)
	defer f.Close()
	if err != nil {
		panic(err)
	}
	bytes, err := ioutil.ReadAll(f)
	if err != nil {
		panic(err)
	}

	// Build the deck struct.
	d := types.NewDeck()

	// Add in cards.
	for _, l := range strings.Split(string(bytes), "\n") {
		count, name := parseLine(l)
		for i := 0; i < count; i++ {
			oracleData := types.GetOracleData(name)
			d.Mainboard = append(d.Mainboard, types.FromOracle(oracleData))
		}
	}

	// Add other metadata.
	if len(labels) > 0 {
		d.Labels = strings.Split(labels, ",")
	}
	d.Wins = wins
	d.Losses = losses
	d.Player = who
	d.Date = date

	return d, nil
}

func writeDeck(d *types.Deck) error {
	// First, write the canonical deck file in our format.
	bs, err := json.MarshalIndent(d, "", " ")
	if err != nil {
		panic(err)
	}
	err = os.WriteFile(fmt.Sprintf("%s/%s.json", outdir, who), bs, os.ModePerm)
	if err != nil {
		panic(err)
	}

	// Also write the original "raw" decklist for posterity.
	f, err := os.Open(deck)
	defer f.Close()
	if err != nil {
		panic(err)
	}
	bytes, err := ioutil.ReadAll(f)
	if err != nil {
		panic(err)
	}
	err = os.WriteFile(fmt.Sprintf("%s/%s.csv", outdir, who), bytes, os.ModePerm)
	if err != nil {
		panic(err)
	}

	// Write it out as a simple text file with one card per line - useful to importing into cubecobra
	// and other tools that accept decklists.
	f2, err := os.Create(fmt.Sprintf("%s/%s.cubecobra.txt", outdir, who))
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

func parseLine(l string) (int, string) {
	if strings.Contains(l, "Quantity") {
		// Skip the header.
		return 0, ""
	} else if len(strings.TrimSpace(l)) == 0 {
		// Skip empty lines.
		return 0, ""
	}
	// Lines are formatted like this:
	// "1,","cardname"
	splits := strings.SplitN(l, ",", 2)
	count, err := strconv.ParseInt(strings.Trim(splits[0], "\""), 10, 32)
	if err != nil {
		panic(err)
	}
	name := strings.Trim(splits[1], "\"")
	return int(count), name
}
