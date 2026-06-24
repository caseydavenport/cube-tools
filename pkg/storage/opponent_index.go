package storage

// OpponentIndex resolves the deck a match was played against. Within a single
// draft a player has at most one deck, so (draftID, player) uniquely identifies
// it. Build the index once from a deck slice and the deck-pairing analyses (match
// Elo, color and archetype matchups, opponent win rate) share one lookup instead
// of each rebuilding their own.
type OpponentIndex struct {
	byKey map[key]*Deck
}

// NewOpponentIndex builds an opponent lookup over the given decks.
func NewOpponentIndex(decks []*Deck) *OpponentIndex {
	byKey := make(map[key]*Deck, len(decks))
	for _, d := range decks {
		byKey[key{player: d.Player, draft: d.Metadata.DraftID}] = d
	}
	return &OpponentIndex{byKey: byKey}
}

// OpponentDeck returns the deck that deck faced against the named opponent, found
// within the same draft. The opponent name comes from a Match or a Game. ok is
// false when the deck has no draft, the opponent is unnamed, or the opponent's
// deck wasn't loaded (e.g. an unrecorded player).
func (i *OpponentIndex) OpponentDeck(deck *Deck, opponent string) (*Deck, bool) {
	if opponent == "" || deck.Metadata.DraftID == "" {
		return nil, false
	}
	d, ok := i.byKey[key{player: opponent, draft: deck.Metadata.DraftID}]
	return d, ok
}
