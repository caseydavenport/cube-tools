package utils

import "math"

// BayesianAverage returns a win percentage shrunk toward 50%, on a 0-100 scale
// rounded to one decimal. priorGames is how many imaginary 50% games are mixed
// in: a record with far fewer real games than that stays near 50%, while one
// with far more keeps its own rate. Draws count as half a win.
func BayesianAverage(wins, losses, draws int, priorGames float64) float64 {
	if wins+losses+draws == 0 {
		return 0.0
	}

	numGames := float64(wins + losses + draws)
	winCount := float64(wins) + float64(draws)/2.0

	// Bayesian average = (wins + baseline * priorGames) / (games + priorGames).
	baseline := 0.5
	pct := (winCount + baseline*priorGames) / (numGames + priorGames)
	return math.Round(pct*1000) / 10.0
}
