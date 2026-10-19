package importer

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func cubeOf(names ...string) *types.Cube {
	c := &types.Cube{}
	for _, n := range names {
		c.Cards = append(c.Cards, types.Card{Name: n})
	}
	return c
}

func TestCheckConsistencyClean(t *testing.T) {
	cube := cubeOf("Monastery Mentor", "Snapcaster Mage")
	decks := []ParsedDeck{{
		Player:    "casey",
		Mainboard: []CountedCard{{Name: "Monastery Mentor", Count: 1}},
		Sideboard: []CountedCard{{Name: "Snapcaster Mage", Count: 1}},
	}}
	r := CheckConsistency(cube, decks)
	if !r.Clean {
		t.Fatalf("expected clean report, got %+v", r.Discrepancies)
	}
}

func TestCheckConsistencyOverAndUnknown(t *testing.T) {
	cube := cubeOf("Monastery Mentor")
	decks := []ParsedDeck{{
		Player:    "casey",
		Mainboard: []CountedCard{{Name: "Monastery Mentor", Count: 2}, {Name: "Black Lotus", Count: 1}},
	}}
	r := CheckConsistency(cube, decks)
	if r.Clean {
		t.Fatal("expected discrepancies")
	}
	kinds := map[string]Discrepancy{}
	for _, d := range r.Discrepancies {
		kinds[d.Kind] = d
	}
	if kinds["over"].CardName != "Monastery Mentor" || kinds["over"].Seen != 2 || kinds["over"].Cube != 1 {
		t.Fatalf("bad over discrepancy: %+v", kinds["over"])
	}
	if kinds["unknown"].CardName != "Black Lotus" {
		t.Fatalf("bad unknown discrepancy: %+v", kinds["unknown"])
	}
}

func TestCheckConsistencyIgnoresBasics(t *testing.T) {
	cube := cubeOf("Monastery Mentor")
	decks := []ParsedDeck{{
		Player:    "casey",
		Mainboard: []CountedCard{{Name: "Monastery Mentor", Count: 1}, {Name: "Plains", Count: 7}},
	}}
	r := CheckConsistency(cube, decks)
	if !r.Clean {
		t.Fatalf("basics should not count against the cube, got %+v", r.Discrepancies)
	}
}

func TestCheckConsistencyMixedCaseUnknown(t *testing.T) {
	cube := cubeOf("Monastery Mentor")
	decks := []ParsedDeck{
		{Player: "Ozzy", Mainboard: []CountedCard{{Name: "Monastery Mentor", Count: 1}, {Name: "black lotus", Count: 1}}},
		{Player: "Stevie", Mainboard: []CountedCard{{Name: "Black Lotus", Count: 1}}},
	}
	r := CheckConsistency(cube, decks)
	if len(r.Discrepancies) != 1 || r.Discrepancies[0].CardName != "Black Lotus" || r.Discrepancies[0].Seen != 2 {
		t.Fatalf("want one unknown Black Lotus seen twice, got %+v", r.Discrepancies)
	}
}

func TestCheckConsistencyCleanEncodesNullDiscrepancies(t *testing.T) {
	cube := cubeOf("Monastery Mentor")
	r := CheckConsistency(cube, []ParsedDeck{{Player: "Ozzy", Mainboard: []CountedCard{{Name: "Monastery Mentor", Count: 1}}}})
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"discrepancies":null`) {
		t.Fatalf("want null discrepancies, got %s", b)
	}
}
