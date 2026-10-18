package players

import (
	"fmt"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// SeatLabel is the display name of an anonymous deck: "p" and its seat
// number, which is unique within its draft.
func SeatLabel(seat int) string {
	return fmt.Sprintf("p%d", seat)
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
			d.Player = SeatLabel(d.SeatNumber())
		}
	}
	for _, d := range decks {
		for i := range d.Matches {
			match := &d.Matches[i]
			if opp, ok := byID[match.OpponentID]; ok && match.OpponentID != 0 {
				match.Opponent = opp.Player
				match.OpponentPlayerID = opp.PlayerID
			}
			switch {
			case match.Wins > match.Losses:
				match.Winner = d.Player
			case match.Losses > match.Wins:
				match.Winner = match.Opponent
			default:
				match.Winner = ""
			}
			for j := range match.Games {
				g := &match.Games[j]
				g.Opponent = match.Opponent
				switch {
				case g.Won:
					g.Winner = d.Player
				case g.Tie:
					g.Winner = ""
				default:
					g.Winner = match.Opponent
				}
			}
		}
	}
}

// nameFor returns the player's display name, or a placeholder naming the ID
// when the list doesn't have it.
func (l *List) nameFor(id int) string {
	if p, ok := l.ByID(id); ok {
		return p.Name
	}
	logrus.WithField("player_id", id).Warn("Deck references a player not in the player list")
	return fmt.Sprintf("player #%d", id)
}
