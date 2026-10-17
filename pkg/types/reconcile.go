package types

import "slices"

// ReconcileRecord applies a record edit to one deck in a draft and keeps the
// rest of the draft consistent. It sets the target deck's player name and
// matches, renames every reference to the target's old name across the draft,
// and mirrors the target's per-round results onto each opponent. Opponents are
// found by OpponentID when set, otherwise by player name, and each edited match
// gets its opponent's current ID and name.
//
// targetID identifies the edited deck. newName is the new player name; "" or a
// value equal to the current name leaves the name unchanged. newMatches
// replaces the edited deck's matches unless it is nil, in which case the
// existing record is kept. It returns every deck it changed, including the
// edited one, or nil if no deck has targetID.
func ReconcileRecord(decks []*Deck, targetID int, newName string, newMatches []Match) []*Deck {
	target := deckByID(decks, targetID)
	if target == nil {
		return nil
	}
	targetOldName := target.Player

	// Remember who the deck played before the edit, so an opponent dropped
	// from its record also loses its mirror of the old match.
	var priorOpps []*Deck
	for _, m := range target.Matches {
		if y := opponentDeck(decks, m); y != nil && y != target && !slices.Contains(priorOpps, y) {
			priorOpps = append(priorOpps, y)
		}
	}

	changed := map[*Deck]bool{target: true}
	if newMatches != nil {
		for i := range newMatches {
			if y := opponentDeck(decks, newMatches[i]); y != nil && y != target {
				newMatches[i].OpponentID = y.ID
				newMatches[i].Opponent = y.Player
			}
		}
		target.Matches = newMatches
	}

	renamed := newName != "" && newName != targetOldName
	if renamed {
		target.Player = newName
	} else {
		newName = targetOldName
	}

	if renamed {
		for _, d := range decks {
			if renameRefs(d, targetOldName, newName) {
				changed[d] = true
			}
		}
	}

	// Only re-mirror opponents when the edited deck's matches actually
	// changed. A rename-only edit already reaches every opponent's own
	// match records via renameRefs above, so re-deriving them here would
	// discard opponent-side detail (like nested Games) that the edited
	// deck's matches don't carry.
	if newMatches != nil {
		// Group the edited deck's matches by opponent deck, skipping the
		// opponent-less override stubs, self-references, and opponents not in
		// the draft. order keeps opponents stable.
		byOpp := map[*Deck][]Match{}
		var order []*Deck
		for _, m := range target.Matches {
			y := opponentDeck(decks, m)
			if y == nil || y == target {
				continue
			}
			if _, ok := byOpp[y]; !ok {
				order = append(order, y)
			}
			byOpp[y] = append(byOpp[y], m)
		}
		for _, y := range priorOpps {
			if _, ok := byOpp[y]; !ok {
				order = append(order, y)
			}
		}
		for _, y := range order {
			// Drop the opponent's existing matches against the edited deck,
			// then append fresh mirrors. An opponent no longer in the record
			// gets no mirrors, so only the drop applies.
			var kept []Match
			for _, m := range y.Matches {
				against := m.OpponentID == target.ID || (m.OpponentID == 0 && m.Opponent == newName)
				if !against {
					kept = append(kept, m)
				}
			}
			if len(kept) == len(y.Matches) && len(byOpp[y]) == 0 {
				continue
			}
			for _, m := range byOpp[y] {
				kept = append(kept, mirrorMatch(m, newName, target.ID))
			}
			y.Matches = kept
			changed[y] = true
		}
	}

	out := make([]*Deck, 0, len(changed))
	for _, d := range decks {
		if changed[d] {
			out = append(out, d)
		}
	}
	return out
}

// deckByID returns the deck with the given ID, or nil.
func deckByID(decks []*Deck, id int) *Deck {
	for _, d := range decks {
		if d.ID == id {
			return d
		}
	}
	return nil
}

// opponentDeck returns the deck a match was played against: by OpponentID
// when the match has one, otherwise by player name. It returns nil for
// opponent-less override stubs and for opponents not in decks.
func opponentDeck(decks []*Deck, m Match) *Deck {
	if m.OpponentID != 0 {
		return deckByID(decks, m.OpponentID)
	}
	if m.Opponent == "" {
		return nil
	}
	for _, d := range decks {
		if d.Player == m.Opponent {
			return d
		}
	}
	return nil
}

// renameRefs rewrites every reference to oldName on the deck (match opponents
// and winners, plus the same fields on nested games) to newName, reporting
// whether it changed anything.
func renameRefs(d *Deck, oldName, newName string) bool {
	changed := false
	for i := range d.Matches {
		m := &d.Matches[i]
		if m.Opponent == oldName {
			m.Opponent = newName
			changed = true
		}
		if m.Winner == oldName {
			m.Winner = newName
			changed = true
		}
		for j := range m.Games {
			g := &m.Games[j]
			if g.Opponent == oldName {
				g.Opponent = newName
				changed = true
			}
			if g.Winner == oldName {
				g.Winner = newName
				changed = true
			}
		}
	}
	return changed
}

// mirrorMatch builds the opponent's view of a match. Game wins and losses swap,
// draws stay, and the actual winner is a player name so it carries over
// unchanged. xName and xID are the edited deck's new name and ID, which become
// the opponent.
func mirrorMatch(m Match, xName string, xID int) Match {
	out := Match{
		Opponent:   xName,
		OpponentID: xID,
		Round:      m.Round,
		Wins:       m.Losses,
		Losses:     m.Wins,
		Draws:      m.Draws,
		Winner:     m.Winner,
	}
	for _, g := range m.Games {
		out.Games = append(out.Games, Game{Opponent: xName, Winner: g.Winner, Tie: g.Tie})
	}
	return out
}
