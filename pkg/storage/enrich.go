package storage

import (
	"math"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Enrich populates each deck's flattened Games list, Stats, and
// OpponentWinPercentage. Opponent win rate is a cross-population calculation, so
// callers must pass the full set of decks for a cube in one call; opponents are
// matched within the same draft.
func Enrich(decks []*Deck) {
	idx := NewOpponentIndex(decks)

	for _, d := range decks {
		d.Games = flattenGames(d)
	}

	for _, d := range decks {
		d.OpponentWinPercentage, d.RatedOpponents = opponentWinPercentage(d, idx)
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

// flattenGames lists every game in the deck's matches. A match with no
// per-game records is expanded from its win, loss and draw tallies.
func flattenGames(d *Deck) []types.Game {
	games := make([]types.Game, 0)
	for _, m := range d.Matches {
		if len(m.Games) > 0 {
			games = append(games, m.Games...)
			continue
		}
		for i := 0; i < m.Wins; i++ {
			games = append(games, types.Game{Opponent: m.Opponent, Winner: d.Player, Won: true})
		}
		for i := 0; i < m.Losses; i++ {
			games = append(games, types.Game{Opponent: m.Opponent, Winner: m.Opponent})
		}
		for i := 0; i < m.Draws; i++ {
			games = append(games, types.Game{Opponent: m.Opponent, Tie: true})
		}
	}
	return games
}

// opponentWinPercentage averages, over the distinct opponents the deck faced,
// each opponent's win rate outside their games against the deck. It returns
// the rounded percentage and the number of opponents averaged, which is zero
// when none could be found or had other games.
func opponentWinPercentage(d *Deck, idx *OpponentIndex) (float64, int) {
	var rates []float64
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
			rates = append(rates, float64(wins)/float64(games))
		}
	}
	if len(rates) == 0 {
		return 0, 0
	}
	total := 0.0
	for _, rate := range rates {
		total += rate
	}
	return math.Round(100 * total / float64(len(rates))), len(rates)
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
