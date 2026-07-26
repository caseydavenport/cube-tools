//go:build ocr_cv

package ocr

import (
	"image"
	"math"

	"gocv.io/x/gocv"
)

// RefinedCard is one detected card top: the edge as a line segment, its tilt
// from horizontal (AngleDeg), and an upright bounding box (Rect) one card height
// below the edge. Rect is for overlays and de-duping; the name-strip crop uses
// TopEdge directly.
type RefinedCard struct {
	TopEdge  [2]image.Point
	AngleDeg float64
	Rect     image.Rectangle
}

const (
	// EdgeMinPlateauWidthFrac is the shortest edge we accept as a card top, as a
	// fraction of estimated card height. 0.35 is about half a card width: wide
	// enough to reject art and playmat streaks, short enough to catch a
	// half-hidden card.
	EdgeMinPlateauWidthFrac = 0.35

	// EdgePlateauMaxStep is the largest vertical jump (px) between neighboring
	// columns still counted as the same edge.
	EdgePlateauMaxStep = 4

	// EdgePlateauMaxAngleDeg keeps only edges that are roughly horizontal.
	EdgePlateauMaxAngleDeg = 45.0

	// EdgePolaritySampleRows is how many rows to average just above a candidate
	// edge to confirm bright sleeve sits there.
	EdgePolaritySampleRows = 6

	// EdgePolaritySampleOffset is the gap (px) left between the edge and the
	// sampled rows, so blurry edge pixels don't skew the average.
	EdgePolaritySampleOffset = 3

	// EdgePolarityAboveMin is how bright the rows above an edge must be to read as
	// the bright sleeve rim. A card top with fully-visible art below it clears this
	// on its own. See isCardTopPolarity for how it combines with the dark-border
	// test below.
	EdgePolarityAboveMin = 130.0

	// EdgePolarityBelowMax and EdgePolarityMinDelta catch the other kind of card
	// top: a rim that isn't bright enough to pass EdgePolarityAboveMin, but sits
	// clearly brighter than a dark printed border just below it. The rows below
	// must be dark (<= BelowMax) and the rim above must beat them by MinDelta. This
	// recovers fully-visible cards; on a fanned name-band stack the pixels below a
	// top are the bright title bar, so this test misses those and the rim-above
	// test carries them instead.
	EdgePolarityBelowMax = 140.0
	EdgePolarityMinDelta = 15.0

	// EdgeMinSleeveRun is how many sleeve pixels a column must run before a
	// sleeve-to-card transition counts, filtering stray flecks of sleeve color.
	EdgeMinSleeveRun = 6

	// EdgePlateauGapBudget is how many empty columns the left-to-right walk may
	// skip before giving up. Card-top rims come through the sleeve mask dashed (the
	// printed border breaks the orange edge into segments), so this has to span a
	// dash gap or every edge shatters into sub-minWidth fragments. Keep it small:
	// too generous and the walk bridges onto a neighboring card's edge, which
	// spawns spurious detections that then suppress real matches in anchor dedup.
	EdgePlateauGapBudget = 8

	// EdgePlateauMaxStepGrowth caps how much the allowed vertical drift grows while
	// bridging a gap. Without a cap, the wide gap budget lets a walk wander onto a
	// neighboring card's edge; with it, drift stays bounded regardless of gap width.
	EdgePlateauMaxStepGrowth = 3
)

// refineCardEdges finds card top borders inside ccBbox: it marks sleeve-to-card
// transitions, groups them into roughly level edges, and keeps those with
// card-top polarity (see isCardTopPolarity).
//
// The second return is a ccBbox-sized debug image of the raw transition pixels.
// Callers that don't want it should Close it.
func refineCardEdges(src, sleeveMask gocv.Mat, ccBbox image.Rectangle, cardHeightEstimate int) ([]RefinedCard, gocv.Mat) {
	if ccBbox.Min.X < 0 {
		ccBbox.Min.X = 0
	}
	if ccBbox.Min.Y < 0 {
		ccBbox.Min.Y = 0
	}
	if ccBbox.Max.X > src.Cols() {
		ccBbox.Max.X = src.Cols()
	}
	if ccBbox.Max.Y > src.Rows() {
		ccBbox.Max.Y = src.Rows()
	}
	if ccBbox.Dx() < 10 || ccBbox.Dy() < 10 {
		return nil, gocv.NewMat()
	}

	gray := gocv.NewMat()
	defer gray.Close()
	gocv.CvtColor(src, &gray, gocv.ColorBGRToGray)

	// bottoms marks, per column, the row where sleeve gives way to card.
	bottoms := gocv.Zeros(ccBbox.Dy(), ccBbox.Dx(), gocv.MatTypeCV8U)
	for x := 0; x < ccBbox.Dx(); x++ {
		srcX := ccBbox.Min.X + x
		run := 0
		// Scan down the column, counting consecutive sleeve pixels.
		for y := 0; y < ccBbox.Dy()-1; y++ {
			on := sleeveMask.GetUCharAt(ccBbox.Min.Y+y, srcX) > 0
			next := sleeveMask.GetUCharAt(ccBbox.Min.Y+y+1, srcX) > 0
			if on {
				run++
			}

			// Sleeve-to-card transition. Ignore short runs so stray flecks of
			// sleeve color on a card face don't count as an edge.
			if on && !next {
				if run >= EdgeMinSleeveRun {
					bottoms.SetUCharAt(y, x, 255)
				}
				run = 0
			}
			if !on {
				run = 0
			}
		}
	}

	// Flatten the marked pixels into a per-column list of transition y values.
	colTrans := make([][]int, ccBbox.Dx())
	for x := 0; x < ccBbox.Dx(); x++ {
		for y := 0; y < ccBbox.Dy(); y++ {
			if bottoms.GetUCharAt(y, x) > 0 {
				colTrans[x] = append(colTrans[x], y)
			}
		}
	}

	claimed := make([]map[int]bool, ccBbox.Dx())
	for x := range claimed {
		claimed[x] = make(map[int]bool, len(colTrans[x]))
	}

	// Greedy left-to-right walk, not a blob merge: one column can hold several
	// transitions (stacked card tops), so a merge would fuse separate cards.
	var plateaus [][]plateauPoint
	for xSeed := 0; xSeed < ccBbox.Dx(); xSeed++ {
		for _, ySeed := range colTrans[xSeed] {
			if claimed[xSeed][ySeed] {
				continue
			}

			// Seed a new plateau at this unclaimed transition.
			claimed[xSeed][ySeed] = true
			plat := []plateauPoint{{
				x: ccBbox.Min.X + xSeed,
				y: ccBbox.Min.Y + ySeed,
			}}
			yCur := ySeed
			gap := 0

			// Walk right, attaching the nearest unclaimed transition in each column.
			for xNext := xSeed + 1; xNext < ccBbox.Dx(); xNext++ {
				bestY := -1

				// Allow more vertical drift after skipping columns: a longer skip can
				// cover more rise or fall on a tilted edge. Cap the growth so bridging
				// a wide dash gap doesn't let the walk drift onto a neighboring edge.
				step := gap + 1
				if step > EdgePlateauMaxStepGrowth {
					step = EdgePlateauMaxStepGrowth
				}
				maxStep := EdgePlateauMaxStep * step
				bestDist := maxStep + 1

				// Find the transition in this column closest to the current y.
				for _, yc := range colTrans[xNext] {
					if claimed[xNext][yc] {
						continue
					}
					d := yc - yCur
					if d < 0 {
						d = -d
					}
					if d <= bestDist {
						bestDist = d
						bestY = yc
					}
				}

				// Nothing close enough: bank a gap, and give up once we've skipped too many.
				if bestY < 0 || bestDist > maxStep {
					gap++
					if gap > EdgePlateauGapBudget {
						break
					}
					continue
				}

				// Attach it and advance the walk.
				claimed[xNext][bestY] = true
				plat = append(plat, plateauPoint{
					x: ccBbox.Min.X + xNext,
					y: ccBbox.Min.Y + bestY,
				})
				yCur = bestY
				gap = 0
			}
			plateaus = append(plateaus, plat)
		}
	}

	minWidth := int(float64(cardHeightEstimate) * EdgeMinPlateauWidthFrac)
	if minWidth < 60 {
		minWidth = 60
	}

	var refined []RefinedCard
	for _, p := range plateaus {
		// Measure the edge by horizontal pixel span, not point count: rims come
		// through dashed, so a full-width edge has far fewer attached points than
		// pixels wide. The walk appends in ascending x, so the ends bound the span.
		if p[len(p)-1].x-p[0].x < minWidth {
			continue
		}
		x1, y1, x2, y2, angle, ok := fitPlateauLine(p)
		if !ok {
			continue
		}
		if math.Abs(angle) > EdgePlateauMaxAngleDeg {
			continue
		}
		if !isCardTopPolarity(gray, (x1+x2)/2, (y1+y2)/2) {
			continue
		}
		refined = append(refined, RefinedCard{
			TopEdge:  [2]image.Point{{X: x1, Y: y1}, {X: x2, Y: y2}},
			AngleDeg: angle,
			Rect:     approxCardRect(image.Pt(x1, y1), image.Pt(x2, y2), angle, cardHeightEstimate, src.Cols(), src.Rows()),
		})
	}
	return refined, bottoms
}

type plateauPoint struct {
	x, y int
}

// fitPlateauLine fits a best-fit (least-squares) line through the plateau's
// points and returns it as endpoints at the leftmost and rightmost x, plus the
// line's tilt from horizontal in degrees. ok=false if the plateau is degenerate
// (no horizontal extent to fit a line through).
func fitPlateauLine(p []plateauPoint) (x1, y1, x2, y2 int, angleDeg float64, ok bool) {
	if len(p) < 2 {
		return 0, 0, 0, 0, 0, false
	}
	// Accumulate the sums the least-squares slope and intercept need.
	var sumX, sumY, sumXY, sumXX float64
	n := float64(len(p))
	for _, pt := range p {
		x := float64(pt.x)
		y := float64(pt.y)
		sumX += x
		sumY += y
		sumXY += x * y
		sumXX += x * x
	}

	// denom is zero only when every point shares an x (no line to fit).
	denom := n*sumXX - sumX*sumX
	if denom == 0 {
		return 0, 0, 0, 0, 0, false
	}
	slope := (n*sumXY - sumX*sumY) / denom
	intercept := (sumY - slope*sumX) / n

	// Evaluate the fitted line at the leftmost and rightmost x for the endpoints.
	x1 = p[0].x
	x2 = p[len(p)-1].x
	y1 = int(math.Round(slope*float64(x1) + intercept))
	y2 = int(math.Round(slope*float64(x2) + intercept))
	angleDeg = math.Atan2(float64(y2-y1), float64(x2-x1)) * 180.0 / math.Pi
	return x1, y1, x2, y2, angleDeg, true
}

// approxCardRect builds an upright box covering the card by dropping one card
// height perpendicular to the top edge from each top corner.
func approxCardRect(pLeft, pRight image.Point, angleDeg float64, cardH, srcW, srcH int) image.Rectangle {
	// Unit vector pointing straight down from the edge into the card.
	rad := angleDeg * math.Pi / 180.0
	perpX := -math.Sin(rad)
	perpY := math.Cos(rad)

	// Top two corners, plus the same two dropped one card height down the perpendicular.
	d := float64(cardH)
	corners := [4]image.Point{
		pLeft,
		pRight,
		{X: pRight.X + int(perpX*d), Y: pRight.Y + int(perpY*d)},
		{X: pLeft.X + int(perpX*d), Y: pLeft.Y + int(perpY*d)},
	}

	// Axis-aligned bounding box of the four corners.
	minX, minY := corners[0].X, corners[0].Y
	maxX, maxY := corners[0].X, corners[0].Y
	for _, c := range corners[1:] {
		if c.X < minX {
			minX = c.X
		}
		if c.Y < minY {
			minY = c.Y
		}
		if c.X > maxX {
			maxX = c.X
		}
		if c.Y > maxY {
			maxY = c.Y
		}
	}

	// Clamp to the image bounds.
	if minX < 0 {
		minX = 0
	}
	if minY < 0 {
		minY = 0
	}
	if maxX > srcW {
		maxX = srcW
	}
	if maxY > srcH {
		maxY = srcH
	}
	return image.Rect(minX, minY, maxX, maxY)
}

// isCardTopPolarity decides whether the edge at (midX, midY) looks like a real
// card top rather than art or a playmat streak that faked a sleeve-to-card
// transition. It samples grayscale rows just above and just below the edge (in
// full-image coordinates) and accepts if either polarity holds: the rim above is
// bright sleeve, or the rim above is clearly brighter than a dark printed border
// below. Fanned name-band stacks only pass the first test (the row below a top is
// the next card's bright title bar); fully-visible cards over dark art only pass
// the second. A single test misses one or the other, so we take both.
func isCardTopPolarity(gray gocv.Mat, midX, midY int) bool {
	if midX < 0 || midX >= gray.Cols() {
		return false
	}
	aboveLo := midY - EdgePolaritySampleRows - EdgePolaritySampleOffset
	aboveHi := midY - EdgePolaritySampleOffset
	if aboveLo < 0 || aboveHi > gray.Rows() {
		return false
	}
	above := rowMean(gray, midX, aboveLo, aboveHi)

	belowLo := midY + EdgePolaritySampleOffset
	belowHi := midY + EdgePolaritySampleOffset + EdgePolaritySampleRows
	if belowHi > gray.Rows() {
		return false
	}
	below := rowMean(gray, midX, belowLo, belowHi)

	brightRim := above >= EdgePolarityAboveMin
	darkBorderBelow := below <= EdgePolarityBelowMax && above-below >= EdgePolarityMinDelta
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
