package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// At independence (count == expected), the score should be exactly 1.0
// regardless of k.
func TestShrinkLift_IndependenceIsOne(t *testing.T) {
	for _, k := range []float64{0, 1, 5, 100} {
		assert.InDelta(t, 1.0, shrinkLift(10, 10, k), 1e-9, "k=%v", k)
		assert.InDelta(t, 1.0, shrinkLift(0.1, 0.1, k), 1e-9, "k=%v", k)
	}
}

// Low-sample noise (large raw lift from a tiny expected count) should be
// pulled toward 1, not amplified. The old formula was (count*lift + k) /
// (count + k), which simplifies to count^2/expected dominating the
// numerator. Confirm the new formula sits much closer to 1 than that.
func TestShrinkLift_PullsNoiseTowardOne(t *testing.T) {
	// count=3, expected=0.2: raw lift is 15. We want a score noticeably
	// below 5 (where the old formula sat) and well below the raw lift.
	score := shrinkLift(3, 0.2, 5)
	assert.Less(t, score, 2.0, "noise should be pulled close to 1, got %v", score)
	assert.Greater(t, score, 1.0, "still above 1 since count > expected")
}

// As sample size grows, the score should converge toward count/expected.
func TestShrinkLift_ConvergesToRawLift(t *testing.T) {
	rawLift := func(c, e float64) float64 { return c / e }

	small := shrinkLift(20, 10, 5)
	large := shrinkLift(2000, 1000, 5)

	assert.Less(t, abs(large-rawLift(2000, 1000)), abs(small-rawLift(20, 10)),
		"larger sample should be closer to raw lift")
	assert.InDelta(t, 2.0, large, 0.01)
}

// Anti-synergy (count < expected) should produce a score below 1.
func TestShrinkLift_AntiSynergyBelowOne(t *testing.T) {
	score := shrinkLift(2, 10, 5)
	assert.Less(t, score, 1.0, "anti-synergy should read as <1, got %v", score)
}

// k=0 disables smoothing and returns raw lift.
func TestShrinkLift_NoSmoothing(t *testing.T) {
	assert.InDelta(t, 3.0, shrinkLift(30, 10, 0), 1e-9)
	assert.InDelta(t, 0.5, shrinkLift(5, 10, 0), 1e-9)
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
