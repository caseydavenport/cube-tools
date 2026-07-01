package importer

import (
	"sort"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CountedCard aliases the shared type so importer code and tests write
// bare CountedCard{...} while there is one underlying definition.
type CountedCard = types.CountedCard

// ParsedDeck is one player's deck as parsed from import text, before it is
// hydrated into full types.Card records.
type ParsedDeck struct {
	Player    string        `json:"player"`
	Filename  string        `json:"filename,omitempty"`
	Pool      []CountedCard `json:"pool,omitempty"`
	Mainboard []CountedCard `json:"mainboard,omitempty"`
	Sideboard []CountedCard `json:"sideboard,omitempty"`
	Warnings  []string      `json:"warnings,omitempty"`
}

// Discrepancy describes a single card whose count across all parsed decks
// doesn't match the cube list. Kind is one of "over", "missing", "unknown".
type Discrepancy struct {
	CardName string `json:"card_name"`
	Seen     int    `json:"seen"`
	Cube     int    `json:"cube"`
	Kind     string `json:"kind"`
}

// ConsistencyReport summarizes how the parsed decks compare to the cube
// list.
type ConsistencyReport struct {
	Clean         bool          `json:"clean"`
	Discrepancies []Discrepancy `json:"discrepancies"`
	CubeTotal     int           `json:"cube_total"`
	SeenTotal     int           `json:"seen_total"`
}

// discrepancyOrder ranks kinds so the loudest errors sort first.
var discrepancyOrder = map[string]int{"unknown": 0, "over": 1, "missing": 2}

// deckCards returns every non-basic counted card across a deck's pool,
// mainboard, and sideboard.
func deckCards(d ParsedDeck) []CountedCard {
	out := []CountedCard{}
	out = append(out, d.Pool...)
	out = append(out, d.Mainboard...)
	out = append(out, d.Sideboard...)
	return out
}

// CheckConsistency compares the summed non-basic cards across every parsed deck
// against the cube list, reporting cards that are over-represented, missing, or
// not in the cube at all. Basic lands are ignored since they aren't cube cards.
func CheckConsistency(cube *types.Cube, decks []ParsedDeck) ConsistencyReport {
	seen := map[string]int{}
	display := map[string]string{}
	for _, d := range decks {
		for _, c := range deckCards(d) {
			if c.Count <= 0 || types.IsBasic(c.Name) {
				continue
			}
			key := strings.ToLower(c.Name)
			seen[key] += c.Count
			display[key] = c.Name
		}
	}

	report := ConsistencyReport{}
	inCube := map[string]bool{}
	want := map[string]int{}
	for _, name := range cube.Names() {
		key := strings.ToLower(name)
		n := cube.MaxCopies(name)
		want[key] = n
		display[key] = name
		inCube[key] = true
		report.CubeTotal += n
	}

	for key, n := range want {
		got := seen[key]
		report.SeenTotal += got
		if got == n {
			continue
		}
		kind := "missing"
		if got > n {
			kind = "over"
		}
		report.Discrepancies = append(report.Discrepancies, Discrepancy{
			CardName: display[key], Seen: got, Cube: n, Kind: kind,
		})
	}
	for key, got := range seen {
		if inCube[key] {
			continue
		}
		report.Discrepancies = append(report.Discrepancies, Discrepancy{
			CardName: display[key], Seen: got, Cube: 0, Kind: "unknown",
		})
	}

	sort.Slice(report.Discrepancies, func(i, j int) bool {
		a, b := report.Discrepancies[i], report.Discrepancies[j]
		if a.Kind != b.Kind {
			return discrepancyOrder[a.Kind] < discrepancyOrder[b.Kind]
		}
		return a.CardName < b.CardName
	})

	for _, d := range report.Discrepancies {
		if d.Kind == "over" || d.Kind == "unknown" {
			report.Clean = false
			return report
		}
	}
	report.Clean = true
	return report
}
