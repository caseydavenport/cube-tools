package utils

import "math"

// BayesianAverage calculates the Bayesian average of a win percentage given the number of wins and losses.
func BayesianAverage(wins, losses, draws int) float64 {
	if wins+losses+draws == 0 {
		return 0.0
	}

	numMatches := float64(wins + losses + draws)

	// We count a draw as half of a win for the purposes of calculating the Bayesian average.
	winCount := float64(wins) + float64(draws)/2.0

	// We assume a binomial distribution of wins and losses, and we want to calculate a Bayesian average of the win percentage.
	// The formula for the Bayesian average is:
	// Bayesian Average = (wins + baseline * certainty) / (numMatches + certainty)
	// where baseline is the prior win percentage we assume, and certainty is the number of matches we want to assume.
	baseline := 0.5

	// Certainty is the baseline number of matches we want to assume. This value
	// acts effectively as a minimum number of matches before we consider the win percentage
	// to be reliable.
	certainty := 30.0

	pct := (winCount + baseline*certainty) / (numMatches + certainty)
	return math.Round(pct*1000) / 10.0
}
