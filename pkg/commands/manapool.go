package commands

import (
	"encoding/csv"
	"fmt"
	"os"
	"slices"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// ManapoolCommand prints the cards in cards.csv that are neither owned nor on
// the maybeboard, one per line as "name [set] collector-number", for pasting
// into a Mana Pool bulk order.
var ManapoolCommand = &cobra.Command{
	Use:   "mp",
	Short: "Generate a manapool bulk order list from a cube CSV file.",
	Run: func(cmd *cobra.Command, args []string) {
		cards, err := parseManapoolCards("cards.csv")
		if err != nil {
			logrus.WithError(err).Fatal("Failed to read the card list")
		}
		for _, card := range cards {
			fmt.Printf("%s [%s] %s\n", card.name, card.set, card.number)
		}
	},
}

// manapoolCard is one card to order: its name and the printing, by set code and
// collector number.
type manapoolCard struct {
	name   string
	set    string
	number string
}

// parseManapoolCards reads the cube CSV at file and returns the cards still
// to buy. The header row must have the name, Set, Collector Number, status and
// maybeboard columns.
func parseManapoolCards(file string) ([]manapoolCard, error) {
	f, err := os.Open(file)
	if err != nil {
		return nil, fmt.Errorf("open CSV file: %w", err)
	}
	defer logClose(f, file)

	records, err := csv.NewReader(f).ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read CSV file: %w", err)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("CSV file %s is empty", file)
	}

	// Find the columns we need from the header.
	nameIdx, setIdx, numIdx, ownedIdx, maybeboardIdx := -1, -1, -1, -1, -1
	for i, col := range records[0] {
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
	columns := []int{nameIdx, setIdx, numIdx, ownedIdx, maybeboardIdx}
	if slices.Contains(columns, -1) {
		return nil, fmt.Errorf("CSV file %s needs name, Set, Collector Number, status and maybeboard columns", file)
	}

	cards := []manapoolCard{}
	for _, record := range records[1:] {
		if record[maybeboardIdx] == "true" || record[ownedIdx] == "true" {
			continue
		}
		cards = append(cards, manapoolCard{name: record[nameIdx], set: record[setIdx], number: record[numIdx]})
	}
	return cards, nil
}
