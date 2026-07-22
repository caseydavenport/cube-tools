package stats

import (
	"math"

	"gonum.org/v1/gonum/stat/distuv"
)

// defaultConfidence is the confidence level used when a request doesn't set
// one. It's deliberately lenient: a low level means a narrow interval, so the
// default view shows most cards as distinguishable from a coin flip. Callers
// that only want strong signals raise it toward 0.95 or 0.99, which widens the
// interval and demands more evidence.
const defaultConfidence = 0.80

// resolveConfidence clamps a requested confidence level into (0,1), falling
// back to the default for unset or nonsensical values.
func resolveConfidence(conf float64) float64 {
	if conf <= 0 || conf >= 1 {
		return defaultConfidence
	}
	return conf
}

// zForConfidence returns the two-sided normal critical value for a confidence
// level (e.g. 0.95 -> ~1.96).
func zForConfidence(conf float64) float64 {
	return distuv.UnitNormal.Quantile((1 + resolveConfidence(conf)) / 2)
}

// wilsonInterval returns the Wilson score interval for a win rate at critical
// value z, on the same 0-100 scale as winPctOf and rounded to one decimal.
// Wilson holds up on small samples and rates near 0 or 1 where the plain normal
// approximation doesn't. Draws count as half a win to match winPctOf, so the
// point estimate sits inside the interval. A record with no games returns (0, 0).
func wilsonInterval(wins, losses, draws int, z float64) (float64, float64) {
	n := float64(wins + losses + draws)
	if n == 0 {
		return 0, 0
	}

	// Observed rate, draws as half a win.
	phat := (float64(wins) + float64(draws)/2) / n

	// Wilson center and margin.
	z2 := z * z
	denom := 1 + z2/n
	center := (phat + z2/(2*n)) / denom
	margin := (z / denom) * math.Sqrt(phat*(1-phat)/n+z2/(4*n*n))

	low := center - margin
	high := center + margin
	if low < 0 {
		low = 0
	}
	if high > 1 {
		high = 1
	}
	return math.Round(1000*low) / 10, math.Round(1000*high) / 10
}
