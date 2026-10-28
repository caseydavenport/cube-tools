package stats

import (
	"math"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// ForestRow is one row of the Deck Stats forest plot: how much a deck's game
// win rate moves with one deck feature. Effects are in win % points per one
// standard deviation of the feature, so rows with different ranges compare.
type ForestRow struct {
	// Key names the feature, matching a forestFeatures key.
	Key string `json:"key"`

	// Decks is how many decks the fit used.
	Decks int `json:"decks"`

	// StdDev is the feature's spread across those decks, in its own units.
	StdDev float64 `json:"std_dev"`

	// HasEffect is false when there were too few decks or no spread to fit.
	// The effect fields are zero then.
	HasEffect bool `json:"has_effect"`

	// Effect is the fitted change in win %, with its confidence interval.
	Effect     float64 `json:"effect"`
	EffectLow  float64 `json:"effect_low"`
	EffectHigh float64 `json:"effect_high"`
}

// forestPoint is one deck's input to a fit: the feature value, the deck's win
// rate from 0 to 1, and its game count as the weight.
type forestPoint struct {
	x, y, weight float64
}

// forestRows fits one row per forest feature across decks with a decklist and
// at least one game. z is the critical value for the interval.
func forestRows(decks []*storage.Deck, z float64) []*ForestRow {
	rows := make([]*ForestRow, 0, len(forestFeatures))
	for _, f := range forestFeatures {
		rows = append(rows, fitForestRow(f.Key, forestPoints(decks, f), z))
	}
	return rows
}

// forestPoints measures feature f on every deck the forest plot uses.
func forestPoints(decks []*storage.Deck, f deckFeature) []forestPoint {
	var points []forestPoint
	for _, d := range decks {
		if !hasDecklist(d) {
			continue
		}
		games := d.GameWins() + d.GameLosses() + d.GameDraws()
		if games == 0 {
			continue
		}
		winRate := (float64(d.GameWins()) + float64(d.GameDraws())/2) / float64(games)
		points = append(points, forestPoint{x: f.Value(d), y: winRate, weight: float64(games)})
	}
	return points
}

// fitForestRow runs a weighted least-squares line through points and scales
// its slope by the feature's standard deviation. The interval is the slope
// plus or minus z standard errors, scaled the same way.
func fitForestRow(key string, points []forestPoint, z float64) *ForestRow {
	row := &ForestRow{Key: key, Decks: len(points)}
	if len(points) < 3 {
		return row
	}

	sd := sampleStdDev(points)
	row.StdDev = round2(sd)

	var sumW, sumWX, sumWY float64
	for _, p := range points {
		sumW += p.weight
		sumWX += p.weight * p.x
		sumWY += p.weight * p.y
	}
	xBar := sumWX / sumW
	yBar := sumWY / sumW

	var sxx, sxy float64
	for _, p := range points {
		sxx += p.weight * (p.x - xBar) * (p.x - xBar)
		sxy += p.weight * (p.x - xBar) * (p.y - yBar)
	}
	if sxx == 0 {
		return row
	}
	slope := sxy / sxx
	intercept := yBar - slope*xBar

	var residual float64
	for _, p := range points {
		miss := p.y - intercept - slope*p.x
		residual += p.weight * miss * miss
	}
	se := math.Sqrt(residual / float64(len(points)-2) / sxx)

	row.HasEffect = true
	row.Effect = round1(100 * slope * sd)
	row.EffectLow = round1(100 * (slope - z*se) * sd)
	row.EffectHigh = round1(100 * (slope + z*se) * sd)
	return row
}

// sampleStdDev is the unweighted sample standard deviation of the points'
// feature values. Callers pass at least two points.
func sampleStdDev(points []forestPoint) float64 {
	var sum float64
	for _, p := range points {
		sum += p.x
	}
	mean := sum / float64(len(points))

	var squares float64
	for _, p := range points {
		squares += (p.x - mean) * (p.x - mean)
	}
	return math.Sqrt(squares / float64(len(points)-1))
}

// round2 rounds f to two decimal places.
func round2(f float64) float64 {
	return math.Round(f*100) / 100
}
