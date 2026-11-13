package ocr

import (
	"slices"
	"strings"
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
		pw := pool(scanned("Brainstorm", 2), scanned("Misty Rainforest", 1))
		d := &types.Deck{Pool: cards("Brainstorm", "Brainstorm", "Misty Rainforest")}
		if needsReconfirm(pw, d) {
			t.Fatal("matching pool should not need reconfirm")
		}
	})

	t.Run("pool-only deck differs from session", func(t *testing.T) {
		// Session was fixed (Brainstrm renamed to Brainstorm) but the deck on
		// disk still has the misread.
		pw := pool(scanned("Brainstorm", 2))
		d := &types.Deck{Pool: cards("Brainstorm", "Brainstrm")}
		if !needsReconfirm(pw, d) {
			t.Fatal("changed pool should need reconfirm")
		}
	})

	t.Run("mainboard deck reconstructs pool from mainboard plus sideboard", func(t *testing.T) {
		// Pool = 2x Brainstorm, 1x Misty Rainforest. Deck plays one Brainstorm
		// (plus a basic), the rest is sideboard. Basics are ignored.
		pw := pool(scanned("Brainstorm", 2), scanned("Misty Rainforest", 1))
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
		pw := &PlayerWork{MainboardCards: []ScannedCard{scanned("Wrath of God", 1)}}
		d := &types.Deck{Mainboard: cards("Wrath of God", "Island"), Sideboard: cards("Brainstorm")}
		if needsReconfirm(pw, d) {
			t.Fatal("session with no pool entries should not need reconfirm")
		}
	})

	t.Run("nil session or deck never needs reconfirm", func(t *testing.T) {
		if needsReconfirm(nil, &types.Deck{Pool: cards("Brainstorm")}) {
			t.Fatal("nil session should not need reconfirm")
		}
		if needsReconfirm(pool(scanned("Brainstorm", 1)), nil) {
			t.Fatal("nil deck should not need reconfirm")
		}
	})
}

func TestDeckWarnings(t *testing.T) {
	t.Run("clean 45-card pool, no mainboard", func(t *testing.T) {
		pw := pool(scanned("Brainstorm", 45))
		if w := deckWarnings(pw); len(w) != 0 {
			t.Fatalf("expected no warnings, got %v", w)
		}
	})

	t.Run("deck-only complete deck has no warnings", func(t *testing.T) {
		// Mainboard scanned but no pool: the pool-relative checks can't run, so a
		// full 45-card deck-only scan draws no warnings (no bogus "Pool has 0").
		pw := &PlayerWork{MainboardCards: []ScannedCard{scanned("Wrath of God", 45)}}
		if w := deckWarnings(pw); len(w) != 0 {
			t.Fatalf("expected no warnings for complete deck-only session, got %v", w)
		}
	})

	t.Run("deck-only short of 45 warns on size", func(t *testing.T) {
		// No pool to cross-check, so mainboard + sideboard is the only guard.
		pw := &PlayerWork{
			MainboardCards: []ScannedCard{scanned("Wrath of God", 40)},
			Sideboard:      map[string]int{"Brainstorm": 3},
		}
		if !slices.Contains(deckWarnings(pw), "Mainboard + sideboard has 43 non-basic cards (expected 45)") {
			t.Fatalf("expected deck-size warning, got %v", deckWarnings(pw))
		}
	})

	t.Run("pool not 45", func(t *testing.T) {
		pw := pool(scanned("Brainstorm", 44))
		if !slices.Contains(deckWarnings(pw), "Pool has 44 cards (expected 45)") {
			t.Fatalf("expected pool-size warning, got %v", deckWarnings(pw))
		}
	})

	t.Run("mainboard card not in pool", func(t *testing.T) {
		pw := &PlayerWork{
			PoolCards:      []ScannedCard{scanned("Brainstorm", 45)},
			MainboardCards: []ScannedCard{scanned("Counterspell", 1)},
		}
		warnings := deckWarnings(pw)
		if !slices.Contains(warnings, `"Counterspell" is in the deck but not the pool`) {
			t.Fatalf("expected not-in-pool warning, got %v", warnings)
		}
	})

	t.Run("mainboard card over the pooled count", func(t *testing.T) {
		pw := &PlayerWork{
			PoolCards:      []ScannedCard{scanned("Brainstorm", 45)},
			MainboardCards: []ScannedCard{scanned("Brainstorm", 46)},
		}
		warnings := deckWarnings(pw)
		if !slices.Contains(warnings, `"Brainstorm" x46 exceeds pool (45)`) {
			t.Fatalf("expected exceeds-pool warning, got %v", warnings)
		}
	})

	t.Run("mainboard within the pool and size range has no warnings", func(t *testing.T) {
		pw := &PlayerWork{
			PoolCards:      []ScannedCard{scanned("Brainstorm", 45)},
			MainboardCards: []ScannedCard{scanned("Brainstorm", 23)},
			Basics:         map[string]int{"Island": 17},
		}
		if warnings := deckWarnings(pw); len(warnings) != 0 {
			t.Fatalf("expected no warnings, got %v", warnings)
		}
	})

	t.Run("nil player has no warnings", func(t *testing.T) {
		if warnings := deckWarnings(nil); len(warnings) != 0 {
			t.Fatalf("expected no warnings, got %v", warnings)
		}
	})

	t.Run("mainboard size out of range, basics counted", func(t *testing.T) {
		pw := &PlayerWork{
			PoolCards:      []ScannedCard{scanned("Brainstorm", 45)},
			MainboardCards: []ScannedCard{scanned("Brainstorm", 20)},
			Basics:         map[string]int{"Island": 5},
		}

		// 20 non-basic + 5 basics = 25, well under 38.
		warnings := deckWarnings(pw)
		if !slices.Contains(warnings, "Mainboard has 25 cards (expected ~40)") {
			t.Fatalf("expected mainboard-size warning, got %v", warnings)
		}
	})
}

func TestDeckWarningsPoolPlayerIgnoresStaleSideboard(t *testing.T) {
	// A pool player's sideboard is the pool minus the mainboard, as the review
	// page shows it. A saved hand-tracked map left over from a deck-only scan
	// mustn't change the total.
	pw := &PlayerWork{
		PoolCards:      []ScannedCard{scanned("Brainstorm", 45)},
		MainboardCards: []ScannedCard{scanned("Brainstorm", 23)},
		Sideboard:      map[string]int{"Counterspell": 3},
		Basics:         map[string]int{"Island": 17},
	}
	for _, w := range deckWarnings(pw) {
		if strings.HasPrefix(w, "Mainboard + sideboard") {
			t.Fatalf("pool player got a stale-sideboard size warning: %q", w)
		}
	}
}

func TestReviewBreakdown(t *testing.T) {
	lands := map[string]bool{
		"Flooded Strand": true,
		"Polluted Delta": true,
	}
	work := &PlayerWork{
		PoolCards: []ScannedCard{
			scanned("Brainstorm", 21),
			scanned("Flooded Strand", 1),
			scanned("Polluted Delta", 1),
			scanned("Ozzy's Bat", 22),
		},
		MainboardCards: []ScannedCard{
			scanned("Brainstorm", 20),
			scanned("Flooded Strand", 1),
			scanned("Polluted Delta", 1),
			scanned("Ozzy's Bat", 1),
		},
		Basics: map[string]int{
			"Plains": 9,
			"Island": 8,
		},
	}
	got := reviewPlayer(work, lands)
	if got.Breakdown != (Breakdown{Cards: 40, Lands: 19, Basics: 17}) {
		t.Fatalf("breakdown = %+v, want cards 40, lands 19, basics 17", got.Breakdown)
	}
	if len(got.Warnings) != 0 {
		t.Fatalf("expected no warnings, got %v", got.Warnings)
	}
}
