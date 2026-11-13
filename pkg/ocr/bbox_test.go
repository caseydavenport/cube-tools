package ocr

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOverlapFraction_NoOverlap(t *testing.T) {
	a := Bbox{X: 0, Y: 0, Width: 10, Height: 10}
	b := Bbox{X: 100, Y: 100, Width: 10, Height: 10}
	require.Equal(t, 0.0, overlapFraction(a, b))
}

func TestOverlapFraction_TouchingEdgesIsNoOverlap(t *testing.T) {
	a := Bbox{X: 0, Y: 0, Width: 10, Height: 10}
	b := Bbox{X: 10, Y: 0, Width: 10, Height: 10}
	require.Equal(t, 0.0, overlapFraction(a, b))
}

func TestOverlapFraction_FullyContained(t *testing.T) {
	a := Bbox{X: 0, Y: 0, Width: 10, Height: 10}
	b := Bbox{X: -5, Y: -5, Width: 100, Height: 100}
	require.Equal(t, 1.0, overlapFraction(a, b))
}

func TestOverlapFraction_HalfOverlap(t *testing.T) {
	a := Bbox{X: 0, Y: 0, Width: 10, Height: 10}
	b := Bbox{X: 5, Y: 0, Width: 10, Height: 10}
	require.InDelta(t, 0.5, overlapFraction(a, b), 1e-9)
}

func TestOverlapFraction_IsRelativeToFirstBox(t *testing.T) {
	small := Bbox{X: 2, Y: 2, Width: 4, Height: 4}
	big := Bbox{X: 0, Y: 0, Width: 10, Height: 10}
	require.Equal(t, 1.0, overlapFraction(small, big))
	require.InDelta(t, 0.16, overlapFraction(big, small), 1e-9)
}

func TestOverlapFraction_ZeroAreaA(t *testing.T) {
	a := Bbox{X: 0, Y: 0, Width: 0, Height: 10}
	b := Bbox{X: 0, Y: 0, Width: 10, Height: 10}
	require.Equal(t, 0.0, overlapFraction(a, b))
}
