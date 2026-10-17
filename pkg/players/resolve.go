package players

import (
	"fmt"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// SeatLabel is the display name of an anonymous deck: "p" and its deck ID,
// which is unique within its draft.
func SeatLabel(deckID int) string {
	return fmt.Sprintf("p%d", deckID)
}

// ResolveDraft fills in the display names deck files don't store: each deck's
// Player, each match's Opponent, OpponentPlayerID and Winner, and each game's
// Opponent and Winner. All decks must come from one draft, since opponents are
// found by deck ID. A deck with no PlayerID keeps a Player already set (a
// remote source's name) and otherwise gets its seat label. A nil list resolves
// seat labels and opponents only.
func (l *List) ResolveDraft(decks []*types.Deck) {
	byID := make(map[int]*types.Deck, len(decks))
	for _, d := range decks {
		byID[d.ID] = d
		switch {
		case d.PlayerID != 0:
			d.Player = l.nameFor(d.PlayerID)
		case d.Player == "":
			d.Player = SeatLabel(d.ID)
		}
	}
	for _, d := range decks {
		for i := range d.Matches {
			m := &d.Matches[i]
			if opp, ok := byID[m.OpponentID]; ok && m.OpponentID != 0 {
				m.Opponent = opp.Player
				m.OpponentPlayerID = opp.PlayerID
			}
			switch {
			case m.Wins > m.Losses:
				m.Winner = d.Player
			case m.Losses > m.Wins:
				m.Winner = m.Opponent
			default:
				m.Winner = ""
			}
			for j := range m.Games {
				g := &m.Games[j]
				g.Opponent = m.Opponent
				switch {
				case g.Won:
					g.Winner = d.Player
				case g.Tie:
					g.Winner = ""
				default:
					g.Winner = m.Opponent
				}
			}
		}
	}
}

// nameFor returns the player's display name, or a placeholder naming the ID
// when the list doesn't have it.
func (l *List) nameFor(id int) string {
	if l != nil {
		if p, ok := l.ByID(id); ok {
			return p.Name
		}
	}
	logrus.WithField("player_id", id).Warn("Deck references a player not in the player list")
	return fmt.Sprintf("player #%d", id)
}
