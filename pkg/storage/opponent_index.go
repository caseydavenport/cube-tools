package storage

import "github.com/caseydavenport/cube-tools/pkg/types"

// OpponentIndex resolves the deck a match was played against, within the
// deck's own draft. A match that carries the opponent's ID is resolved by ID;
// otherwise the opponent's player name, which is unique within a draft, is
// used. Build the index once from a deck slice and the deck-pairing analyses
// (match Elo, color and archetype matchups, opponent win rate) share one lookup
// instead of each rebuilding their own.
type OpponentIndex struct {
	byID   map[key]*Deck
	byName map[nameKey]*Deck
}

// NewOpponentIndex builds an opponent lookup over the given decks.
func NewOpponentIndex(decks []*Deck) *OpponentIndex {
	i := &OpponentIndex{
		byID:   make(map[key]*Deck, len(decks)),
		byName: make(map[nameKey]*Deck, len(decks)),
	}
	for _, d := range decks {
		i.byID[key{draft: d.Metadata.DraftID, id: d.ID}] = d
		i.byName[nameKey{draft: d.Metadata.DraftID, player: d.Player}] = d
	}
	return i
}

// OpponentDeck returns the deck that deck faced against the named opponent, found
// within the same draft. Use it where only a name is known, such as a Game; for
// a Match, MatchOpponent also honors the opponent's ID. ok is false when the
// deck has no draft, the opponent is unnamed, or the opponent's deck wasn't
// loaded (e.g. an unrecorded player).
func (i *OpponentIndex) OpponentDeck(deck *Deck, opponent string) (*Deck, bool) {
	if opponent == "" || deck.Metadata.DraftID == "" {
		return nil, false
	}
	d, ok := i.byName[nameKey{draft: deck.Metadata.DraftID, player: opponent}]
	return d, ok
}

// MatchOpponent returns the deck that deck faced in match m: by m.OpponentID
// when set, otherwise by m.Opponent's name. ok is false when the opponent
// can't be found in the deck's draft.
func (i *OpponentIndex) MatchOpponent(deck *Deck, m types.Match) (*Deck, bool) {
	if deck.Metadata.DraftID == "" {
		return nil, false
	}
	return i.find(deck.Metadata.DraftID, m)
}

// find resolves m's opponent within draft, which may be empty. Enrich uses it
// directly because it also enriches draft-less decks built in tests and
// legacy data.
func (i *OpponentIndex) find(draft string, m types.Match) (*Deck, bool) {
	if m.OpponentID != 0 {
		d, ok := i.byID[key{draft: draft, id: m.OpponentID}]
		return d, ok
	}
	if m.Opponent == "" {
		return nil, false
	}
	d, ok := i.byName[nameKey{draft: draft, player: m.Opponent}]
	return d, ok
}
