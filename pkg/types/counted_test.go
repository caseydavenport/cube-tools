package types

import "testing"

func TestExpandCounted(t *testing.T) {
	out := ExpandCounted([]CountedCard{{Name: "Monastery Mentor", Count: 2}, {Name: "Snapcaster Mage", Count: 1}})
	if len(out) != 3 {
		t.Fatalf("want 3 cards, got %d", len(out))
	}
}

func TestDeriveSideboardFloorsAtZero(t *testing.T) {
	// Pool has 2 Monastery Mentor; mainboard plays 1, leaving 1 in the sideboard.
	// Basics in the mainboard are ignored, so the pool's Plains stay put.
	pool := []CountedCard{{Name: "Monastery Mentor", Count: 2}, {Name: "Plains", Count: 3}}
	main := []CountedCard{{Name: "Monastery Mentor", Count: 1}, {Name: "Plains", Count: 7}}
	sb := DeriveSideboard(pool, main)
	mentors := 0
	plains := 0
	for _, c := range sb {
		switch c.Name {
		case "Monastery Mentor":
			mentors++
		case "Plains":
			plains++
		}
	}
	if mentors != 1 {
		t.Fatalf("want 1 leftover Monastery Mentor, got %d", mentors)
	}
	if plains != 3 {
		t.Fatalf("basics should not be subtracted; want 3 Plains, got %d", plains)
	}
}
