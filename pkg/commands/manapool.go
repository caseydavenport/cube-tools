package commands

import (
	"encoding/csv"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var ManapoolCommand = &cobra.Command{
	Use:   "mp",
	Short: "Generate a manapool bulk order list from a cube CSV file.",
	Run: func(cmd *cobra.Command, args []string) {
		cards := parseCards("cards.csv")
		for _, card := range cards {
			fmt.Printf("%s [%s] %s\n", card.name, card.set, card.num)
		}
	},
}

type card struct {
	name string
	set  string
	num  string
}

func parseCards(file string) []card {
	cards := []card{}

	// Open the CSV file.
	f, err := os.Open(file)
	if err != nil {
		fmt.Println("Error opening CSV file:", err)
		return nil
	}
	defer f.Close()

	// Read the CSV file.
	reader := csv.NewReader(f)
	records, err := reader.ReadAll()
	if err != nil {
		fmt.Println("Error reading CSV file:", err)
		return nil
	}

	// Get the indices of relevant columns from the header.
	header := records[0]
	nameIdx, setIdx, numIdx, ownedIdx, maybeboardIdx := -1, -1, -1, -1, -1
	for i, col := range header {
		switch col {
		case "name":
			nameIdx = i
		case "Set":
			setIdx = i
		case "Collector Number":
			numIdx = i
		case "status":
			ownedIdx = i
		case "maybeboard":
			maybeboardIdx = i
		}
	}

	// Parse the records into card structs.
	for _, record := range records[1:] { // Skip header row
		if len(record) < 3 {
			continue // Skip rows that don't have enough columns
		}
		name := record[nameIdx]
		set := record[setIdx]
		num := record[numIdx]
		owned := record[ownedIdx]
		maybeboard := record[maybeboardIdx]

		if maybeboard == "true" {
			continue // Skip maybeboard cards
		}
		if owned == "true" {
			continue // Skip owned cards
		}

		cards = append(cards, card{name: name, set: set, num: num})
	}

	return cards
}
