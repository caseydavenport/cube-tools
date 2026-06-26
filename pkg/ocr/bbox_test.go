package ocr

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOverlapFraction_NoOverlap(t *testing.T) {
	a := Bbox{X: 0, Y: 0, Width: 10, Height: 10}
	b := Bbox{X: 100, Y: 100, Width: 10, Height: 10}
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

func TestOverlapFraction_ZeroAreaA(t *testing.T) {
	a := Bbox{X: 0, Y: 0, Width: 0, Height: 10}
	b := Bbox{X: 0, Y: 0, Width: 10, Height: 10}
	require.Equal(t, 0.0, overlapFraction(a, b))
}

func TestBboxIntersectionOverUnion(t *testing.T) {
	cases := []struct {
		name string
		a    Bbox
		b    Bbox
		want float64
	}{
		{"identical", Bbox{0, 0, 10, 10}, Bbox{0, 0, 10, 10}, 1.0},
		{"disjoint", Bbox{0, 0, 10, 10}, Bbox{20, 20, 10, 10}, 0.0},
		{"half-overlap-on-x", Bbox{0, 0, 10, 10}, Bbox{5, 0, 10, 10}, 50.0 / 150.0},
		{"contained", Bbox{0, 0, 10, 10}, Bbox{2, 2, 4, 4}, 16.0 / 100.0},
		{"a-zero-area", Bbox{0, 0, 0, 10}, Bbox{0, 0, 10, 10}, 0.0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := bboxIntersectionOverUnion(tc.a, tc.b)
			if math.Abs(got-tc.want) > 1e-9 {
				t.Fatalf("bboxIntersectionOverUnion(%v, %v) = %v, want %v", tc.a, tc.b, got, tc.want)
			}
		})
	}
}
