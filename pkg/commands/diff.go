package commands

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"

	"github.com/caseydavenport/cube-tools/pkg/flag"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"

	"github.com/spf13/cobra"
)

var (
	from string
	to   string
)

// Takes a cube snapshot json file and emits a newline-separated list of cards in the cube.
var PrintCube = &cobra.Command{
	Use:   "print-cube",
	Short: "Open a cube snapshot file and print the cards in it",
	Run: func(cmd *cobra.Command, args []string) {
		cubePath := "data/polyverse/2023-06-17/cube-snapshot.json"

		cube, err := loadCubeFile(cubePath)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to load cube file")
		}
		for _, card := range cube.Cards {
			fmt.Println(card.Name)
		}
	},
}

// Define a cobra command for parsing a single deck file.
var DiffCubeCmd = &cobra.Command{
	Use:   "diff",
	Short: "Show the difference between two cube files",
	Run: func(cmd *cobra.Command, args []string) {
		// Determine path to the cube files.
		if from == "" {
			logrus.Fatal("Must specify a cube file to diff from.")
		}
		fromPath := fmt.Sprintf("data/polyverse/%s/cube-snapshot.json", from)

		toPath := fmt.Sprintf("data/polyverse/%s/cube-snapshot.json", to)
		if to == "" {
			// If no "to" draft is specified, diff against the current cube.
			toPath = "data/polyverse/cube.json"
		}

		// Diff the cubes.
		diff, err := diffCubes(fromPath, toPath)
		if err != nil {
			logrus.WithError(err).Fatal("Failed to diff cubes")
		}
		diff.Print()
	},
}

func init() {
	// Add flags for the command to parse a single deck.
	flags := DiffCubeCmd.Flags()
	flag.StringVarP(flags, &from, "from", "f", "FROM", "", "Date of the cube file to diff from")
	flag.StringVarP(flags, &to, "to", "t", "TO", "", "Date of the cube file to diff to")
}

type cubeDiff struct {
	Added   []string
	Removed []string
}

func (d *cubeDiff) Print() {
	if len(d.Added) > 0 {
		fmt.Printf("=== Added %d cards ===\n\n", len(d.Added))
		for _, card := range d.Added {
			fmt.Println(card)
		}
	}

	fmt.Println()

	if len(d.Removed) > 0 {
		fmt.Printf("=== Removed %d cards ===\n\n", len(d.Removed))
		for _, card := range d.Removed {
			fmt.Println(card)
		}
	}
}

// diffCubes compares two cube files and returns the difference between them.
func diffCubes(fromPath, toPath string) (*cubeDiff, error) {
	fromCube, err := loadCubeFile(fromPath)
	if err != nil {
		return nil, err
	}
	toCube, err := loadCubeFile(toPath)
	if err != nil {
		return nil, err
	}

	// Build maps of card names for each cube.
	fromMap := make(map[string]int)
	for _, card := range fromCube.Cards {
		if _, ok := fromMap[card.Name]; !ok {
			fromMap[card.Name] = 0
		}
		fromMap[card.Name] += 1
	}
	toMap := make(map[string]int)
	for _, card := range toCube.Cards {
		if _, ok := toMap[card.Name]; !ok {
			toMap[card.Name] = 0
		}
		toMap[card.Name] += 1
	}

	// Iterate over the cards in the "to" cube and check if they are in the "from" cube.
	// Any that are not are considered "added".
	added := make([]string, 0)
	for card := range toMap {
		if _, ok := fromMap[card]; !ok {
			added = append(added, card)
		} else if ok && fromMap[card] < toMap[card] {
			// If the card is in both cubes, but there are more copies of it in the "to" cube,
			// consider each additional copy as "added".
			for i := fromMap[card]; i < toMap[card]; i++ {
				added = append(added, card)
			}
		}
	}
	sort.Strings(added)

	// Iterate over the cards in the "from" cube and check if they are in the "to" cube.
	// Any that are not are considered "removed".
	removed := make([]string, 0)
	for card := range fromMap {
		if _, ok := toMap[card]; !ok {
			removed = append(removed, card)
		} else if ok && toMap[card] < fromMap[card] {
			// If the card is in both cubes, but there are more copies of it in the "from" cube,
			// consider each additional copy as "removed".
			for i := toMap[card]; i < fromMap[card]; i++ {
				removed = append(removed, card)
			}
		}
	}
	sort.Strings(removed)

	return &cubeDiff{
		Added:   added,
		Removed: removed,
	}, nil
}

func loadCubeFile(filename string) (*types.Cube, error) {
	// Load the cube file.
	f, err := os.Open(filename)
	defer f.Close()
	if err != nil {
		logrus.WithError(err).Fatal("Failed to open deck file")
	}

	bytes, err := io.ReadAll(f)
	if err != nil {
		panic(err)
	}
	cube := types.Cube{}
	if err = json.Unmarshal(bytes, &cube); err != nil {
		logrus.Fatal("Failed to unmarshal cube file")
	}
	return &cube, nil
}
