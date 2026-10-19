package importer

import (
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CountedCard aliases the shared type so importer code and tests write
// bare CountedCard{...} while there is one underlying definition.
type CountedCard = types.CountedCard

// ParsedDeck is one player's deck as parsed from import text, before it is
// hydrated into full types.Card records. Player is the name hint parsing
// derived from the file name; PlayerID is the player the reviewer picked,
// zero for an anonymous seat.
type ParsedDeck struct {
	Player    string        `json:"player"`
	PlayerID  int           `json:"player_id,omitempty"`
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
// not in the cube at all. Missing cards don't make a draft unclean, since a
// draft with empty seats always has some.
func CheckConsistency(cube *types.Cube, decks []ParsedDeck) ConsistencyReport {
	var cards []CountedCard
	for _, d := range decks {
		cards = append(cards, deckCards(d)...)
	}
	check := cube.CheckDraft(cards)

	report := ConsistencyReport{
		Clean:     check.Conflicts() == 0,
		CubeTotal: check.CubeTotal,
		SeenTotal: check.SeenInCube,
	}
	for _, d := range check.Discrepancies {
		report.Discrepancies = append(report.Discrepancies, Discrepancy{
			CardName: d.CardName, Seen: d.Seen, Cube: d.Cube, Kind: string(d.Kind),
		})
	}
	return report
}
