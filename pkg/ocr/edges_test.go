//go:build ocr_cv

package ocr

import (
	"image"
	"testing"

	"github.com/stretchr/testify/require"
	"gocv.io/x/gocv"
)

func TestFitPlateauLine_LevelEdge(t *testing.T) {
	plateau := []image.Point{{X: 10, Y: 50}, {X: 20, Y: 50}, {X: 30, Y: 50}}
	top, ok := fitPlateauLine(plateau)
	require.True(t, ok)
	require.Equal(t, image.Pt(10, 50), top.left)
	require.Equal(t, image.Pt(30, 50), top.right)
	require.InDelta(t, 0.0, top.angleDeg, 1e-9)
}

func TestFitPlateauLine_TiltedEdge(t *testing.T) {
	plateau := []image.Point{{X: 0, Y: 0}, {X: 50, Y: 50}, {X: 100, Y: 100}}
	top, ok := fitPlateauLine(plateau)
	require.True(t, ok)
	require.Equal(t, image.Pt(100, 100), top.right)
	require.InDelta(t, 45.0, top.angleDeg, 1e-9)
	require.Equal(t, 50, top.midY())
}

func TestFitPlateauLine_DegenerateInputs(t *testing.T) {
	_, ok := fitPlateauLine([]image.Point{{X: 5, Y: 5}})
	require.False(t, ok, "one point has no line")

	_, ok = fitPlateauLine([]image.Point{{X: 5, Y: 5}, {X: 5, Y: 9}})
	require.False(t, ok, "points sharing an x have no horizontal extent")
}

func TestWalkPlateaus_SeparatesStackedEdges(t *testing.T) {
	// Two level edges 40 rows apart across 20 columns must stay separate.
	columnTransitions := make([][]int, 20)
	for x := range columnTransitions {
		columnTransitions[x] = []int{10, 50}
	}
	plateaus := walkPlateaus(columnTransitions, image.Rect(100, 200, 120, 300))
	require.Len(t, plateaus, 2)
	for _, plateau := range plateaus {
		require.Len(t, plateau, 20)
		require.Equal(t, 100, plateau[0].X)
		require.Equal(t, plateau[0].Y, plateau[len(plateau)-1].Y)
	}
	require.Equal(t, 210, plateaus[0][0].Y)
	require.Equal(t, 250, plateaus[1][0].Y)
}

func TestWalkPlateaus_BridgesSmallGapButNotLargeOne(t *testing.T) {
	small := make([][]int, 20)
	small[0], small[5], small[10] = []int{10}, []int{10}, []int{10}
	plateaus := walkPlateaus(small, image.Rect(0, 0, 20, 100))
	require.Len(t, plateaus, 1, "gaps within the budget keep one edge")
	require.Len(t, plateaus[0], 3)

	large := make([][]int, 30)
	large[0], large[25] = []int{10}, []int{10}
	plateaus = walkPlateaus(large, image.Rect(0, 0, 30, 100))
	require.Len(t, plateaus, 2, "a gap over the budget splits the edge")
}

func TestFindValleys(t *testing.T) {
	profile := []int{0, 0, 0, 0, 9, 9, 9, 0, 0, 9, 9, 0, 0, 0, 0, 0}
	got := findValleys(profile, 0, 3)
	require.Equal(t, []columnValley{{start: 0, end: 4}, {start: 11, end: 16}}, got, "the two-wide dip between columns is too narrow to count")

	require.Empty(t, findValleys([]int{9, 9, 9, 9}, 0, 2))
}

func TestSmoothRollingSum(t *testing.T) {
	got := smoothRollingSum([]int{0, 0, 9, 0, 0}, 2)
	require.Equal(t, []int{0, 9, 9, 9, 0}, got)
}

func TestDetectColumnRects_SplitsOnGap(t *testing.T) {
	mask := gocv.NewMatWithSize(50, 400, gocv.MatTypeCV8U)
	defer mask.Close()
	for y := 0; y < 50; y++ {
		for x := 0; x < 400; x++ {
			if x < 150 || x >= 250 {
				mask.SetUCharAt(y, x, 255)
			}
		}
	}

	// Smoothing bleeds the gap's edges by a pixel or two, so allow some slack.
	got := detectColumnRects(mask, 100)
	require.Len(t, got, 2)
	require.Equal(t, 0, got[0].Min.X)
	require.InDelta(t, 150, got[0].Max.X, 3)
	require.InDelta(t, 250, got[1].Min.X, 3)
	require.Equal(t, 400, got[1].Max.X)
}

func TestDetectColumnRects_EmptyMaskAndBadCardWidth(t *testing.T) {
	mask := gocv.NewMatWithSize(50, 400, gocv.MatTypeCV8U)
	defer mask.Close()
	require.Nil(t, detectColumnRects(mask, 100), "no sleeve pixels means no columns")

	mask.SetTo(gocv.NewScalar(255, 0, 0, 0))
	require.Nil(t, detectColumnRects(mask, 0), "a non-positive card width can't size anything")
}

func TestNameBandThickness(t *testing.T) {
	require.Equal(t, minNameBandThickness, nameBandThickness(10), "tiny cards get the minimum")
	require.Greater(t, nameBandThickness(400), minNameBandThickness)
}

func TestReadRotatedImage_Errors(t *testing.T) {
	_, err := readRotatedImage("/nonexistent/photo.jpg", 0)
	require.ErrorContains(t, err, "could not load image")
}
