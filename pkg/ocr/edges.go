//go:build ocr_cv

package ocr

import (
	"image"
	"math"

	"gocv.io/x/gocv"
)

// cardTop is one detected card top: the edge as a line segment from its left
// end to its right end, and its tilt from horizontal (angleDeg). The name-strip
// crop is cut perpendicular to this edge.
type cardTop struct {
	left     image.Point
	right    image.Point
	angleDeg float64
}

// length returns the pixel length of the top edge.
func (c cardTop) length() float64 {
	dx := float64(c.right.X - c.left.X)
	dy := float64(c.right.Y - c.left.Y)
	return math.Sqrt(dx*dx + dy*dy)
}

// midY returns the vertical middle of the top edge, which orders stacked cards.
func (c cardTop) midY() int {
	return (c.left.Y + c.right.Y) / 2
}

const (
	// edgeMinPlateauWidthFrac is the shortest edge accepted as a card top, as a
	// fraction of card height. 0.35 is about half a card width: enough to reject
	// streaks, short enough to catch a half-hidden card.
	edgeMinPlateauWidthFrac = 0.35

	// edgeMinPlateauWidth is the pixel floor for that minimum, so a tiny card
	// height estimate can't let noise through.
	edgeMinPlateauWidth = 60

	// edgePlateauMaxStep is the largest vertical jump (px) between neighboring
	// columns still counted as the same edge.
	edgePlateauMaxStep = 4

	// edgePlateauMaxAngleDeg keeps only edges that are roughly horizontal.
	edgePlateauMaxAngleDeg = 45.0

	// edgePolaritySampleRows is how many rows to average just above a candidate
	// edge to confirm bright sleeve sits there.
	edgePolaritySampleRows = 6

	// edgePolaritySampleOffset is the gap (px) left between the edge and the
	// sampled rows, so blurry edge pixels don't skew the average.
	edgePolaritySampleOffset = 3

	// edgePolarityAboveMin is how bright the rows above an edge must be to read
	// as the bright sleeve rim. A card top with fully-visible art below it
	// clears this alone; isCardTopPolarity covers the dark-border alternative.
	edgePolarityAboveMin = 130.0

	// edgePolarityBelowMax and edgePolarityMinDelta define the second kind of
	// card top: a dimmer rim clearly brighter than a dark printed border. Rows
	// below must be at most BelowMax, and the rim must beat them by MinDelta.
	edgePolarityBelowMax = 140.0
	edgePolarityMinDelta = 15.0

	// edgeMinSleeveRun is how many sleeve pixels a column must run before a
	// sleeve-to-card transition counts, filtering stray flecks of sleeve color.
	edgeMinSleeveRun = 6

	// edgePlateauGapBudget is how many empty columns the left-to-right walk may
	// skip before giving up. It must span a dash gap in the rim, but stay small
	// or the walk bridges onto a neighboring card.
	edgePlateauGapBudget = 8

	// edgePlateauMaxStepGrowth caps how much the allowed vertical drift grows
	// while bridging a gap, so a wide gap budget can't wander onto another edge.
	edgePlateauMaxStepGrowth = 3

	// minSearchRegionSize is the smallest width or height (px) of a region worth
	// searching for card tops.
	minSearchRegionSize = 10
)

// findCardTops finds card top borders inside region: it marks sleeve-to-card
// transitions, groups them into roughly level edges, and keeps those with
// card-top polarity (see isCardTopPolarity). cardHeightEstimate sets the
// shortest edge worth keeping.
func findCardTops(src, sleeveMask gocv.Mat, region image.Rectangle, cardHeightEstimate int) []cardTop {
	region = region.Intersect(image.Rect(0, 0, src.Cols(), src.Rows()))
	if region.Dx() < minSearchRegionSize || region.Dy() < minSearchRegionSize {
		return nil
	}

	gray := gocv.NewMat()
	defer gray.Close()
	gocv.CvtColor(src, &gray, gocv.ColorBGRToGray)

	bottoms := markSleeveBottoms(sleeveMask, region)
	defer bottoms.Close()

	// Flatten the marked pixels into a per-column list of transition y values.
	columnTransitions := make([][]int, region.Dx())
	for column := range columnTransitions {
		for y := 0; y < region.Dy(); y++ {
			if bottoms.GetUCharAt(y, column) > 0 {
				columnTransitions[column] = append(columnTransitions[column], y)
			}
		}
	}

	minWidth := max(edgeMinPlateauWidth, int(float64(cardHeightEstimate)*edgeMinPlateauWidthFrac))

	var tops []cardTop
	for _, plateau := range walkPlateaus(columnTransitions, region) {
		// Measure by horizontal pixel span, not point count: dashed rims give a
		// full-width edge far fewer points than pixels wide. The walk appends in
		// ascending x, so the ends bound the span.
		if plateau[len(plateau)-1].X-plateau[0].X < minWidth {
			continue
		}
		top, ok := fitPlateauLine(plateau)
		if !ok || math.Abs(top.angleDeg) > edgePlateauMaxAngleDeg {
			continue
		}
		if !isCardTopPolarity(gray, (top.left.X+top.right.X)/2, top.midY()) {
			continue
		}
		tops = append(tops, top)
	}
	return tops
}

// markSleeveBottoms returns a region-sized black-and-white image with a white
// pixel wherever sleeve gives way to card going down a column (the bottom of a
// sleeve run at least edgeMinSleeveRun tall). The caller must Close the Mat.
func markSleeveBottoms(sleeveMask gocv.Mat, region image.Rectangle) gocv.Mat {
	bottoms := gocv.Zeros(region.Dy(), region.Dx(), gocv.MatTypeCV8U)
	for column := 0; column < region.Dx(); column++ {
		srcX := region.Min.X + column
		run := 0

		// Scan down the column, counting consecutive sleeve pixels.
		for y := 0; y < region.Dy()-1; y++ {
			on := sleeveMask.GetUCharAt(region.Min.Y+y, srcX) > 0
			next := sleeveMask.GetUCharAt(region.Min.Y+y+1, srcX) > 0
			if !on {
				run = 0
				continue
			}
			run++

			// Sleeve-to-card transition. Ignore short runs so stray flecks of
			// sleeve color on a card face don't count as an edge.
			if !next {
				if run >= edgeMinSleeveRun {
					bottoms.SetUCharAt(y, column, 255)
				}
				run = 0
			}
		}
	}
	return bottoms
}

// walkPlateaus chains per-column transitions into plateaus: runs of points that
// form one roughly level edge, in source-image coordinates. columnTransitions
// holds the transition rows for each column of region.
func walkPlateaus(columnTransitions [][]int, region image.Rectangle) [][]image.Point {
	claimed := make([]map[int]bool, len(columnTransitions))
	for x := range claimed {
		claimed[x] = make(map[int]bool, len(columnTransitions[x]))
	}

	// Greedy left-to-right walk, not a blob merge: one column can hold several
	// transitions (stacked card tops), so a merge would fuse separate cards.
	var plateaus [][]image.Point
	for xSeed := range columnTransitions {
		for _, ySeed := range columnTransitions[xSeed] {
			if claimed[xSeed][ySeed] {
				continue
			}

			// Seed a new plateau at this unclaimed transition.
			claimed[xSeed][ySeed] = true
			plateau := []image.Point{{X: region.Min.X + xSeed, Y: region.Min.Y + ySeed}}
			yCurrent := ySeed
			gap := 0

			// Walk right, attaching the nearest unclaimed transition in each column.
			for xNext := xSeed + 1; xNext < len(columnTransitions); xNext++ {
				// Allow more vertical drift after skipping columns, since a longer skip
				// covers more rise on a tilted edge. Cap it so a wide gap can't drift
				// onto a neighboring edge.
				maxStep := edgePlateauMaxStep * min(gap+1, edgePlateauMaxStepGrowth)

				// Find the transition in this column closest to the current y.
				bestY := -1
				bestDist := maxStep + 1
				for _, y := range columnTransitions[xNext] {
					if claimed[xNext][y] {
						continue
					}
					if dist := max(y-yCurrent, yCurrent-y); dist <= bestDist {
						bestDist = dist
						bestY = y
					}
				}

				// Nothing close enough: bank a gap, and give up once we've skipped too many.
				if bestY < 0 || bestDist > maxStep {
					gap++
					if gap > edgePlateauGapBudget {
						break
					}
					continue
				}

				// Attach it and advance the walk.
				claimed[xNext][bestY] = true
				plateau = append(plateau, image.Point{X: region.Min.X + xNext, Y: region.Min.Y + bestY})
				yCurrent = bestY
				gap = 0
			}
			plateaus = append(plateaus, plateau)
		}
	}
	return plateaus
}

// fitPlateauLine fits a best-fit (least-squares) line through the plateau's
// points, which must be in ascending x. The result runs from the leftmost to the
// rightmost x. ok is false if the plateau has no horizontal extent to fit.
func fitPlateauLine(plateau []image.Point) (cardTop, bool) {
	if len(plateau) < 2 {
		return cardTop{}, false
	}

	// Accumulate the sums the least-squares slope and intercept need.
	var sumX, sumY, sumXY, sumXX float64
	count := float64(len(plateau))
	for _, point := range plateau {
		x := float64(point.X)
		y := float64(point.Y)
		sumX += x
		sumY += y
		sumXY += x * y
		sumXX += x * x
	}

	// denominator is zero only when every point shares an x (no line to fit).
	denominator := count*sumXX - sumX*sumX
	if denominator == 0 {
		return cardTop{}, false
	}
	slope := (count*sumXY - sumX*sumY) / denominator
	intercept := (sumY - slope*sumX) / count

	// Evaluate the fitted line at the leftmost and rightmost x for the endpoints.
	leftX := plateau[0].X
	rightX := plateau[len(plateau)-1].X
	left := image.Pt(leftX, int(math.Round(slope*float64(leftX)+intercept)))
	right := image.Pt(rightX, int(math.Round(slope*float64(rightX)+intercept)))
	angleDeg := math.Atan2(float64(right.Y-left.Y), float64(right.X-left.X)) * 180.0 / math.Pi
	return cardTop{left: left, right: right, angleDeg: angleDeg}, true
}

// isCardTopPolarity decides whether the edge at (midX, midY) is a real card top
// rather than art or a playmat streak. It compares grayscale rows just above and
// below the edge, and accepts a bright rim above, or a rim clearly brighter than
// a dark printed border below. Fanned stacks only pass the first test, and
// fully-visible cards over dark art only the second.
func isCardTopPolarity(gray gocv.Mat, midX, midY int) bool {
	if midX < 0 || midX >= gray.Cols() {
		return false
	}
	aboveLo := midY - edgePolaritySampleRows - edgePolaritySampleOffset
	aboveHi := midY - edgePolaritySampleOffset
	if aboveLo < 0 || aboveHi > gray.Rows() {
		return false
	}
	above := rowMean(gray, midX, aboveLo, aboveHi)

	belowLo := midY + edgePolaritySampleOffset
	belowHi := midY + edgePolaritySampleOffset + edgePolaritySampleRows
	if belowHi > gray.Rows() {
		return false
	}
	below := rowMean(gray, midX, belowLo, belowHi)

	brightRim := above >= edgePolarityAboveMin
	darkBorderBelow := below <= edgePolarityBelowMax && above-below >= edgePolarityMinDelta
	return brightRim || darkBorderBelow
}

// rowMean averages column midX of gray over rows [loY, hiY).
func rowMean(gray gocv.Mat, midX, loY, hiY int) float64 {
	sum := 0.0
	for y := loY; y < hiY; y++ {
		sum += float64(gray.GetUCharAt(y, midX))
	}
	return sum / float64(hiY-loY)
}
