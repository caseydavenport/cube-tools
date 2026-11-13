package ocr

import (
	"fmt"
	"maps"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// A player drafts 45 cards and builds a 40-card deck from them. The size
// warnings allow some slack around 40 for a few more or fewer basics.
const (
	draftedPoolSize      = 45
	minMainboardSize     = 38
	maxMainboardSize     = 46
	typicalMainboardSize = 40
)

// poolCountsFromCards sums a session's saved pool list by lowercased name,
// excluding basics (entered through their own control, not part of the cube).
func poolCountsFromCards(cards []ScannedCard) map[string]int {
	counts := map[string]int{}
	for _, card := range cards {
		if card.Count <= 0 || types.IsBasic(card.CardName) {
			continue
		}
		counts[strings.ToLower(card.CardName)] += card.Count
	}
	return counts
}

// poolCountsFromDeck reconstructs the confirmed pool from a written deck so it
// can be compared against the live session. A pool-only player stores the pool
// directly; a player who built a mainboard stored pool = non-basic mainboard +
// sideboard (basics excluded), matching how confirm splits them.
func poolCountsFromDeck(deck *types.Deck) map[string]int {
	counts := map[string]int{}
	add := func(cards []types.Card) {
		for _, card := range cards {
			if types.IsBasic(card.Name) {
				continue
			}
			counts[strings.ToLower(card.Name)]++
		}
	}
	if len(deck.Pool) > 0 {
		add(deck.Pool)
		return counts
	}
	add(deck.Mainboard)
	add(deck.Sideboard)
	return counts
}

// needsReconfirm reports whether a confirmed player's deck on disk is stale:
// the live session pool differs from what was written. Editing a confirmed
// player (a consistency-panel fix, or the workspace) updates the session but not
// the deck, so the deck must be re-confirmed to catch up.
func needsReconfirm(work *PlayerWork, deck *types.Deck) bool {
	if work == nil || deck == nil {
		return false
	}

	// Without a scanned pool there is nothing to compare against the deck. That
	// happens for a deck-only scan, or scratch work on a draft confirmed outside
	// the pool flow, so don't flag it as stale.
	if len(work.PoolCards) == 0 {
		return false
	}
	return !maps.Equal(poolCountsFromCards(work.PoolCards), poolCountsFromDeck(deck))
}

// deckWarnings checks a player's saved lists for cards that don't add up. The
// review page shows them while editing, and the draft view uses them to flag a
// confirmed deck without opening each player.
func deckWarnings(work *PlayerWork) []string {
	if work == nil {
		return nil
	}

	var warnings []string

	// These checks are relative to the scanned pool, so without one there is
	// nothing to say. Skipping them keeps deck-only scans and scratch work from
	// reporting a bogus "Pool has 0 cards".
	if len(work.PoolCards) > 0 {
		poolTotal := 0
		poolCountByName := map[string]int{}
		for _, card := range work.PoolCards {
			poolTotal += card.Count
			poolCountByName[card.CardName] = card.Count
		}
		basicTotal := 0
		for _, n := range work.Basics {
			basicTotal += n
		}

		// The pool should be exactly what was drafted.
		if poolTotal != draftedPoolSize {
			warnings = append(warnings, fmt.Sprintf("Pool has %d cards (expected %d)", poolTotal, draftedPoolSize))
		}

		// Every non-basic mainboard card must come from the pool, in at most
		// the pooled quantity.
		mainDrafted := 0
		for _, card := range work.MainboardCards {
			if types.IsBasic(card.CardName) {
				continue
			}
			mainDrafted += card.Count
			switch {
			case poolCountByName[card.CardName] == 0:
				warnings = append(warnings, fmt.Sprintf("%q is in the deck but not the pool", card.CardName))
			case card.Count > poolCountByName[card.CardName]:
				warnings = append(warnings, fmt.Sprintf("%q x%d exceeds pool (%d)", card.CardName, card.Count, poolCountByName[card.CardName]))
			}
		}

		// The mainboard, basics included, should be close to a full deck.
		if size := mainDrafted + basicTotal; size > 0 && (size < minMainboardSize || size > maxMainboardSize) {
			warnings = append(warnings, fmt.Sprintf("Mainboard has %d cards (expected ~%d)", size, typicalMainboardSize))
		}
	}

	// A drafted deck is 45 non-basic cards. Unlike the checks above this runs
	// even for a deck-only scan, where it is the only size guard.
	if total := nonBasicDeckTotal(work); total > 0 && total != draftedPoolSize {
		warnings = append(warnings, fmt.Sprintf("Mainboard + sideboard has %d non-basic cards (expected %d)", total, draftedPoolSize))
	}
	return warnings
}

// nonBasicDeckTotal counts the non-basic cards across a player's mainboard and
// sideboard. A player with a pool has the sideboard derived from pool minus
// mainboard, and a deck-only scan uses the hand-tracked map, matching how the
// review page and confirm split the two.
func nonBasicDeckTotal(work *PlayerWork) int {
	total := 0
	for _, card := range work.MainboardCards {
		if !types.IsBasic(card.CardName) {
			total += card.Count
		}
	}
	if len(work.PoolCards) == 0 {
		for name, n := range work.Sideboard {
			if !types.IsBasic(name) {
				total += n
			}
		}
		return total
	}
	for _, card := range types.DeriveSideboard(toCountedCards(work.PoolCards), toCountedCards(work.MainboardCards)) {
		if !types.IsBasic(card.Name) {
			total++
		}
	}
	return total
}

// toCountedCards adapts saved cards to the counted-card shape the types
// helpers take.
func toCountedCards(cards []ScannedCard) []types.CountedCard {
	counted := make([]types.CountedCard, len(cards))
	for i, card := range cards {
		counted[i] = types.CountedCard{Name: card.CardName, Count: card.Count}
	}
	return counted
}

// reviewPlayer builds a player's review from their saved lists. lands flags the
// non-basic cards that are lands; a card missing from it isn't one.
func reviewPlayer(work *PlayerWork, lands map[string]bool) PlayerReview {
	review := PlayerReview{Warnings: deckWarnings(work)}
	if review.Warnings == nil {
		review.Warnings = []string{}
	}
	for _, n := range work.Basics {
		review.Breakdown.Basics += n
	}

	// Basics are lands and count toward the deck's cards.
	review.Breakdown.Cards = review.Breakdown.Basics
	review.Breakdown.Lands = review.Breakdown.Basics
	for _, card := range work.MainboardCards {
		if types.IsBasic(card.CardName) {
			continue
		}
		review.Breakdown.Cards += card.Count
		if lands[card.CardName] {
			review.Breakdown.Lands += card.Count
		}
	}
	return review
}
