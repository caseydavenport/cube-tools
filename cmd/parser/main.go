package main

import (
	"encoding/json"
	"flag"
	"io/ioutil"
	"os"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

var (
	deck   string
	wins   int
	losses int
	labels string
	who    string
)

func init() {
	flag.StringVar(&deck, "deck", "", "Path to the deck file to import")
	flag.StringVar(&who, "who", "", "Who made the deck")
	flag.IntVar(&wins, "wins", 0, "Number of wins")
	flag.IntVar(&losses, "losses", 0, "Number of losses")
	flag.StringVar(&labels, "labels", "", "Labels describing the deck. e.g., aggro,sacrifice")
}

func main() {
	// Parser parses a text representation of a deck and turns it into a Deck compatible
	// with the rest of the tooling in this repository.
	parseFlags()
	loadedDeck, err := loadFile()
	if err != nil {
		panic(err)
	}

	// Write the loaded deck to disk.
	bs, err := json.MarshalIndent(loadedDeck, "", " ")
	if err != nil {
		panic(err)
	}
	err = os.WriteFile("output", bs, os.ModePerm)
	if err != nil {
		panic(err)
	}
}

func parseFlags() error {
	flag.Parse()
	return nil
}

func loadFile() (*types.Deck, error) {
	f, err := os.Open(deck)
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
			d.Mainboard = append(d.Mainboard, types.Card{
				Name: name,
			})
		}
	}

	// Add other metadata.
	if len(labels) > 0 {
		d.Labels = strings.Split(labels, ",")
	}
	d.Wins = wins
	d.Losses = losses
	d.Player = who

	return d, nil
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
	splits := strings.Split(l, ",")
	count, err := strconv.ParseInt(strings.Trim(splits[0], "\""), 10, 32)
	if err != nil {
		panic(err)
	}
	name := strings.Trim(splits[1], "\"")
	return int(count), name
}
