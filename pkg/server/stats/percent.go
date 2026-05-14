package stats

import "math"

// pct returns num/denom as a percentage rounded to 2 decimal places, or 0
// if denom is 0. We keep sub-percent precision in the JSON so the UI's
// sort orders are stable even when displayed values round to the same
// integer; the UI is responsible for formatting (e.g. toFixed(0)).
func pct(num, denom float64) float64 {
	if denom == 0 {
		return 0
	}
	return math.Round(10000*num/denom) / 100
}
