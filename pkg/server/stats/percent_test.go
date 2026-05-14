package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPct_ZeroDenom(t *testing.T) {
	assert.Equal(t, 0.0, pct(5, 0))
	assert.Equal(t, 0.0, pct(0, 0))
}

func TestPct_TwoDecimalPrecision(t *testing.T) {
	// 2/3 = 66.666... → 66.67 to 2 dp.
	assert.InDelta(t, 66.67, pct(2, 3), 1e-9)
	// 1/3 = 33.333... → 33.33.
	assert.InDelta(t, 33.33, pct(1, 3), 1e-9)
}

// Two ratios that round to the same integer percent must remain distinct
// after pct(). The old code returned math.Round(100*a/b) (integer), which
// collapsed these together and left sort order map-iteration-dependent.
func TestPct_PreservesSubPercentOrdering(t *testing.T) {
	// 66/100 = 66.00, 67/100 = 67.00 — easy case.
	// Harder case: 200/301 and 199/300 both round to 66.something integer
	// but the underlying ratios differ.
	a := pct(200, 301) // 66.4452 → 66.45
	b := pct(199, 300) // 66.3333 → 66.33
	assert.Greater(t, a, b, "sub-percent precision should preserve ordering: %v vs %v", a, b)
}
