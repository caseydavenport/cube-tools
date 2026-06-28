package ocr

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func cards(names ...string) []types.Card {
	out := make([]types.Card, len(names))
	for i, n := range names {
		out[i] = types.Card{Name: n}
	}
	return out
}

func TestNeedsReconfirm(t *testing.T) {
	t.Run("pool-only deck matches session", func(t *testing.T) {
		pw := pool(entry("Brainstorm", 2), entry("Misty Rainforest", 1))
		d := &types.Deck{Pool: cards("Brainstorm", "Brainstorm", "Misty Rainforest")}
		if needsReconfirm(pw, d) {
			t.Fatal("matching pool should not need reconfirm")
		}
	})

	t.Run("pool-only deck differs from session", func(t *testing.T) {
		// Session was fixed (Brainstrm renamed to Brainstorm) but the deck on
		// disk still has the misread.
		pw := pool(entry("Brainstorm", 2))
		d := &types.Deck{Pool: cards("Brainstorm", "Brainstrm")}
		if !needsReconfirm(pw, d) {
			t.Fatal("changed pool should need reconfirm")
		}
	})

	t.Run("mainboard deck reconstructs pool from mainboard plus sideboard", func(t *testing.T) {
		// Pool = 2x Brainstorm, 1x Misty Rainforest. Deck plays one Brainstorm
		// (plus a basic), the rest is sideboard. Basics are ignored.
		pw := pool(entry("Brainstorm", 2), entry("Misty Rainforest", 1))
		d := &types.Deck{
			Mainboard: cards("Brainstorm", "Island"),
			Sideboard: cards("Brainstorm", "Misty Rainforest"),
		}
		if needsReconfirm(pw, d) {
			t.Fatal("reconstructed pool should match session")
		}
	})

	t.Run("deck-only session with no pool work never needs reconfirm", func(t *testing.T) {
		// A scratch deck scan (mainboard only, no pool) on a draft confirmed
		// outside the pool flow should not be flagged stale.
		pw := &PlayerWork{MainboardEntries: []PoolEntry{entry("Wrath of God", 1)}}
		d := &types.Deck{Mainboard: cards("Wrath of God", "Island"), Sideboard: cards("Brainstorm")}
		if needsReconfirm(pw, d) {
			t.Fatal("session with no pool entries should not need reconfirm")
		}
	})

	t.Run("nil session or deck never needs reconfirm", func(t *testing.T) {
		if needsReconfirm(nil, &types.Deck{Pool: cards("Brainstorm")}) {
			t.Fatal("nil session should not need reconfirm")
		}
		if needsReconfirm(pool(entry("Brainstorm", 1)), nil) {
			t.Fatal("nil deck should not need reconfirm")
		}
	})
}

func TestDeckWarnings(t *testing.T) {
	t.Run("clean 45-card pool, no mainboard", func(t *testing.T) {
		pw := pool(entry("Brainstorm", 45))
		if w := deckWarnings(pw); len(w) != 0 {
			t.Fatalf("expected no warnings, got %v", w)
		}
	})

	t.Run("deck-only session with no pool work has no warnings", func(t *testing.T) {
		// Mainboard scanned but no pool: the pool-relative checks can't run, so
		// don't emit a bogus "Pool has 0 cards" or not-in-pool warning.
		pw := &PlayerWork{MainboardEntries: []PoolEntry{entry("Wrath of God", 1)}}
		if w := deckWarnings(pw); len(w) != 0 {
			t.Fatalf("expected no warnings for deck-only session, got %v", w)
		}
	})

	t.Run("pool not 45", func(t *testing.T) {
		pw := pool(entry("Brainstorm", 44))
		w := deckWarnings(pw)
		if len(w) != 1 {
			t.Fatalf("expected 1 warning, got %v", w)
		}
	})

	t.Run("mainboard card not in pool", func(t *testing.T) {
		pw := &PlayerWork{
			PoolEntries:      []PoolEntry{entry("Brainstorm", 45)},
			MainboardEntries: []PoolEntry{entry("Counterspell", 1)},
		}
		w := deckWarnings(pw)
		found := false
		for _, m := range w {
			if m == `"Counterspell" is in the deck but not the pool` {
				found = true
			}
		}
		if !found {
			t.Fatalf("expected not-in-pool warning, got %v", w)
		}
	})

	t.Run("mainboard size out of range, basics counted", func(t *testing.T) {
		pw := &PlayerWork{
			PoolEntries:      []PoolEntry{entry("Brainstorm", 45)},
			MainboardEntries: []PoolEntry{entry("Brainstorm", 20)},
			Basics:           map[string]int{"Island": 5},
		}
		// 20 non-basic + 5 basics = 25, well under 38.
		w := deckWarnings(pw)
		found := false
		for _, m := range w {
			if m == "Mainboard has 25 cards (expected ~40)" {
				found = true
			}
		}
		if !found {
			t.Fatalf("expected mainboard-size warning, got %v", w)
		}
	})
}
