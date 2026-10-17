package storage

import (
	"math"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// Enrich populates each deck's flattened Games list, Stats, and
// OpponentWinPercentage. Opponent win rate is a cross-population calculation, so
// callers must pass the full set of decks for a cube in one call; opponents are
// matched within the same draft.
func Enrich(decks []*Deck) {
	idx := NewOpponentIndex(decks)

	for _, d := range decks {
		d.Games = make([]types.Game, 0)
		for _, m := range d.Matches {
			if len(m.Games) > 0 {
				d.Games = append(d.Games, m.Games...)
				continue
			}
			for i := 0; i < m.Wins; i++ {
				d.Games = append(d.Games, types.Game{Opponent: m.Opponent, Winner: d.Player, Won: true})
			}
			for i := 0; i < m.Losses; i++ {
				d.Games = append(d.Games, types.Game{Opponent: m.Opponent, Winner: m.Opponent})
			}
			for i := 0; i < m.Draws; i++ {
				d.Games = append(d.Games, types.Game{Opponent: m.Opponent, Tie: true})
			}
		}
	}

	for _, d := range decks {
		percentages := []float64{}
		seen := map[*Deck]bool{}
		for _, m := range d.Matches {
			if m.Opponent == "" && m.OpponentID == 0 {
				continue
			}
			opponentDeck, ok := idx.find(d.Metadata.DraftID, m)
			if !ok {
				logrus.WithField("opponent", m.Opponent).Warn("failed to find opponent deck")
				continue
			}
			if seen[opponentDeck] {
				continue
			}
			seen[opponentDeck] = true
			wins, games := opponentRecordExcluding(opponentDeck, d)
			if games > 0 {
				percentages = append(percentages, float64(wins)/float64(games))
			}
		}
		if len(percentages) > 0 {
			total := 0.0
			for _, p := range percentages {
				total += p
			}
			d.OpponentWinPercentage = math.Round(100 * total / float64(len(percentages)))
		} else {
			d.OpponentWinPercentage = 0.0
		}
		d.Stats = Stats{
			MatchWins:   d.MatchWins(),
			MatchLosses: d.MatchLosses(),
			MatchDraws:  d.MatchDraws(),
			GameWins:    d.GameWins(),
			GameLosses:  d.GameLosses(),
			GameDraws:   d.GameDraws(),
			Trophies:    d.Trophies(),
			LastPlace:   d.LastPlace(),
		}
	}
}

// opponentRecordExcluding returns (wins, total games) for opponentDeck across all
// of its matches, excluding matches played against exclude (by ID when the match
// has one, else by name). Prefers per-game records when present and falls back
// to the match-level tally for legacy data.
func opponentRecordExcluding(opponentDeck, exclude *Deck) (int, int) {
	wins, total := 0, 0
	for _, om := range opponentDeck.Matches {
		if (om.OpponentID != 0 && om.OpponentID == exclude.ID) || (om.OpponentID == 0 && om.Opponent == exclude.Player) {
			continue
		}
		if len(om.Games) > 0 {
			for _, og := range om.Games {
				total++
				if og.Winner == opponentDeck.Player {
					wins++
				}
			}
			continue
		}
		wins += om.Wins
		total += om.Wins + om.Losses + om.Draws
	}
	return wins, total
}
