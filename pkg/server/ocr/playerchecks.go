package ocr

import (
	"fmt"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// poolCountsFromEntries sums a session's saved pool list by lowercased name,
// excluding basics (entered through their own control, not part of the cube).
func poolCountsFromEntries(entries []PoolEntry) map[string]int {
	counts := map[string]int{}
	for _, e := range entries {
		if e.Count <= 0 || types.IsBasic(e.CardName) {
			continue
		}
		counts[strings.ToLower(e.CardName)] += e.Count
	}
	return counts
}

// poolCountsFromDeck reconstructs the confirmed pool from a written deck so it
// can be compared against the live session. A pool-only player stores the pool
// directly; a player who built a mainboard stored pool = non-basic mainboard +
// sideboard (basics excluded), matching how confirm splits them.
func poolCountsFromDeck(d *types.Deck) map[string]int {
	counts := map[string]int{}
	add := func(cards []types.Card) {
		for _, c := range cards {
			if types.IsBasic(c.Name) {
				continue
			}
			counts[strings.ToLower(c.Name)]++
		}
	}
	if len(d.Pool) > 0 {
		add(d.Pool)
		return counts
	}
	add(d.Mainboard)
	add(d.Sideboard)
	return counts
}

// needsReconfirm reports whether a confirmed player's deck on disk is stale: the
// live session pool no longer matches what was written. Editing a confirmed
// player (a consistency-panel fix, or the workspace) updates the session but not
// the deck, so the deck must be re-confirmed to catch up.
func needsReconfirm(pw *PlayerWork, d *types.Deck) bool {
	if pw == nil || d == nil {
		return false
	}

	// No scanned pool means there's nothing to compare against the deck. This
	// happens for a deck-only scan or stray scratch work on a draft that was
	// confirmed outside the pool flow, so don't flag it as stale.
	if len(pw.PoolEntries) == 0 {
		return false
	}
	return !equalCounts(poolCountsFromEntries(pw.PoolEntries), poolCountsFromDeck(d))
}

func equalCounts(a, b map[string]int) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

// deckWarnings mirrors the client cross-check (ui/src/utils/CrossCheck.js) from
// the session's saved derived lists, so the draft view can flag a confirmed deck
// whose pool/mainboard doesn't add up without opening each player.
func deckWarnings(pw *PlayerWork) []string {
	if pw == nil {
		return nil
	}

	// Every check below is relative to the scanned pool, so without one there's
	// nothing meaningful to say. Skips deck-only scans and stray scratch work,
	// which would otherwise report a bogus "Pool has 0 cards".
	if len(pw.PoolEntries) == 0 {
		return nil
	}
	poolTotal := 0
	poolByName := map[string]int{}
	for _, e := range pw.PoolEntries {
		poolTotal += e.Count
		poolByName[e.CardName] = e.Count
	}
	basicTotal := 0
	for _, n := range pw.Basics {
		basicTotal += n
	}

	var w []string
	if poolTotal != 45 {
		w = append(w, fmt.Sprintf("Pool has %d cards (expected 45)", poolTotal))
	}
	mainDrafted := 0
	for _, e := range pw.MainboardEntries {
		if types.IsBasic(e.CardName) {
			continue
		}
		mainDrafted += e.Count
		switch {
		case poolByName[e.CardName] == 0:
			w = append(w, fmt.Sprintf("%q is in the deck but not the pool", e.CardName))
		case e.Count > poolByName[e.CardName]:
			w = append(w, fmt.Sprintf("%q x%d exceeds pool (%d)", e.CardName, e.Count, poolByName[e.CardName]))
		}
	}
	if size := mainDrafted + basicTotal; size > 0 && (size < 38 || size > 46) {
		w = append(w, fmt.Sprintf("Mainboard has %d cards (expected ~40)", size))
	}
	return w
}
