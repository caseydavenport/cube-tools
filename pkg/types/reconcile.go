package types

import "slices"

// ReconcileRecord replaces one deck's matches and keeps the rest of the draft
// consistent by mirroring the deck's per-round results onto each opponent.
// Opponents are found by OpponentID only; a match without one is an
// opponent-less stub. Each edited match gets its opponent's display name.
//
// targetID identifies the edited deck, and newMatches replaces its matches. It
// returns every deck it changed, including the edited one, or nil if no deck
// has targetID.
func ReconcileRecord(decks []*Deck, targetID int, newMatches []Match) []*Deck {
	target := deckByID(decks, targetID)
	if target == nil {
		return nil
	}

	// Remember who the deck played before the edit, so an opponent dropped
	// from its record also loses its mirror of the old match.
	var priorOpponents []*Deck
	for _, m := range target.Matches {
		if opponent := opponentDeck(decks, m); opponent != nil && opponent != target && !slices.Contains(priorOpponents, opponent) {
			priorOpponents = append(priorOpponents, opponent)
		}
	}
	for i := range newMatches {
		if opponent := opponentDeck(decks, newMatches[i]); opponent != nil && opponent != target {
			newMatches[i].Opponent = opponent.Player
		} else {
			newMatches[i].OpponentID = 0
		}
	}
	target.Matches = newMatches
	changed := map[*Deck]bool{target: true}

	// Group the edited deck's matches by opponent deck, skipping the
	// opponent-less stubs and self-references. opponentOrder keeps the
	// opponents in a stable order.
	matchesByOpponent := map[*Deck][]Match{}
	var opponentOrder []*Deck
	for _, m := range target.Matches {
		opponent := opponentDeck(decks, m)
		if opponent == nil || opponent == target {
			continue
		}
		if _, ok := matchesByOpponent[opponent]; !ok {
			opponentOrder = append(opponentOrder, opponent)
		}
		matchesByOpponent[opponent] = append(matchesByOpponent[opponent], m)
	}
	for _, opponent := range priorOpponents {
		if _, ok := matchesByOpponent[opponent]; !ok {
			opponentOrder = append(opponentOrder, opponent)
		}
	}
	for _, opponent := range opponentOrder {
		// Drop the opponent's existing matches against the edited deck, then
		// append fresh mirrors. An opponent dropped from the record gets no
		// mirrors, so only the drop applies.
		var kept []Match
		for _, m := range opponent.Matches {
			if m.OpponentID != target.ID {
				kept = append(kept, m)
			}
		}
		if len(kept) == len(opponent.Matches) && len(matchesByOpponent[opponent]) == 0 {
			continue
		}
		for _, m := range matchesByOpponent[opponent] {
			kept = append(kept, mirrorMatch(m, target.Player, target.ID))
		}
		opponent.Matches = kept
		changed[opponent] = true
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

// opponentDeck returns the deck a match was played against, by OpponentID. It
// returns nil for opponent-less stubs and for opponents not in decks.
func opponentDeck(decks []*Deck, m Match) *Deck {
	if m.OpponentID == 0 {
		return nil
	}
	return deckByID(decks, m.OpponentID)
}

// mirrorMatch builds the opponent's view of a match. Game wins and losses swap
// and draws stay. Winner names carry over unchanged, but each game's Won flips.
// editedName and editedID are the edited deck's display name and ID, which
// become the opponent.
func mirrorMatch(m Match, editedName string, editedID int) Match {
	out := Match{
		Opponent:   editedName,
		OpponentID: editedID,
		Round:      m.Round,
		Wins:       m.Losses,
		Losses:     m.Wins,
		Draws:      m.Draws,
		Winner:     m.Winner,
	}
	for _, g := range m.Games {
		out.Games = append(out.Games, Game{Opponent: editedName, Winner: g.Winner, Won: !g.Won && !g.Tie, Tie: g.Tie})
	}
	return out
}
