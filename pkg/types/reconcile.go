package types

// ReconcileRecord applies a record edit to one deck in a draft and keeps the
// rest of the draft consistent. It sets the target deck's player name and
// matches, renames every reference to the target's old name across the draft,
// and mirrors the target's per-round results onto each opponent. Decks are
// matched to opponents by player name.
//
// targetOldName identifies the edited deck by its current player name. newName
// is the new player name; "" or a value equal to targetOldName leaves the name
// unchanged. newMatches replaces the edited deck's matches unless it is nil, in
// which case the existing record is kept. It returns every deck it changed,
// including the edited one, or nil if no deck matches targetOldName.
func ReconcileRecord(decks []*Deck, targetOldName, newName string, newMatches []Match) []*Deck {
	var x *Deck
	for _, d := range decks {
		if d.Player == targetOldName {
			x = d
			break
		}
	}
	if x == nil {
		return nil
	}

	changed := map[*Deck]bool{x: true}
	if newMatches != nil {
		x.Matches = newMatches
	}

	renamed := newName != "" && newName != targetOldName
	if renamed {
		x.Player = newName
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
		// Group the edited deck's matches by opponent, skipping the
		// opponent-less override stubs and any self-reference. order keeps
		// opponents stable.
		byOpp := map[string][]Match{}
		var order []string
		for _, m := range x.Matches {
			if m.Opponent == "" || m.Opponent == newName {
				continue
			}
			if _, ok := byOpp[m.Opponent]; !ok {
				order = append(order, m.Opponent)
			}
			byOpp[m.Opponent] = append(byOpp[m.Opponent], m)
		}
		for _, opp := range order {
			var y *Deck
			for _, d := range decks {
				if d.Player == opp {
					y = d
					break
				}
			}
			if y == nil {
				continue
			}
			// Drop the opponent's existing matches against the edited deck,
			// then append fresh mirrors.
			var kept []Match
			for _, m := range y.Matches {
				if m.Opponent != newName {
					kept = append(kept, m)
				}
			}
			for _, m := range byOpp[opp] {
				kept = append(kept, mirrorMatch(m, newName))
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
// unchanged. xName is the edited deck's new name, which becomes the opponent.
func mirrorMatch(m Match, xName string) Match {
	out := Match{
		Opponent: xName,
		Round:    m.Round,
		Wins:     m.Losses,
		Losses:   m.Wins,
		Draws:    m.Draws,
		Winner:   m.Winner,
	}
	for _, g := range m.Games {
		out.Games = append(out.Games, Game{Opponent: xName, Winner: g.Winner, Tie: g.Tie})
	}
	return out
}
