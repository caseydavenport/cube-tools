//go:build ocr_cv

package ocr

import (
	"errors"
	"fmt"
	"image"
	"math"
	"runtime"
	"sort"
	"sync"

	"github.com/sirupsen/logrus"
	"gocv.io/x/gocv"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ocrSem caps concurrent tesseract processes across the whole program, because
// cards, strategies and server-side photos all run concurrently. It's sized to
// the CPU count so we don't spawn far more processes than cores.
var ocrSem = make(chan struct{}, max(1, runtime.NumCPU()))

// cardHeightDivisor is the assumed number of card heights that stack vertically
// in a typical photo; it turns image height into a card-height estimate.
const cardHeightDivisor = 7.0

// cardAspectWidthOverHeight is the MTG card aspect ratio (63mm / 88mm), for
// estimating card width from the height estimate.
const cardAspectWidthOverHeight = 63.0 / 88.0

// columnValleyThreshFrac is the fraction of the peak below which an
// x-projection column counts as a gap. Very low: the dip between a card's two
// edges is ~5% of peak, a true gap ~0.
const columnValleyThreshFrac = 0.03

// columnMinValleyWidthFrac is the fraction of the card width a gap must span to
// count as a real inter-column gap. Tight layouts can have gaps as narrow as
// ~10px, so keep it small.
const columnMinValleyWidthFrac = 0.04

// columnSmoothWidthFrac is the rolling-sum smoothing window for the
// x-projection, as a fraction of card width. Wide enough to suppress
// single-pixel noise, narrow enough to preserve real gaps.
const columnSmoothWidthFrac = 1.0 / 60.0

// columnMinWidthFrac is the fraction of the card width a candidate column must
// span to be kept, filtering slivers between two close gaps.
const columnMinWidthFrac = 0.35

// columnMinSpanPx is the floor (px) for the smoothing window and the valley
// width, so a small card width estimate can't shrink them to nothing.
const columnMinSpanPx = 3

// minTopEdgeLength is the shortest top edge (px) cropNameBand will cut a strip
// from; anything shorter is too small to hold readable text.
const minTopEdgeLength = 20

// minNameBandThickness is the thinnest name strip (px) cropNameBand cuts, so a
// small card still yields enough rows for tesseract.
const minNameBandThickness = 12

// nameBandHeightFrac is the name strip's height as a fraction of card height.
// The title bar fills about the top sixth, so the strip needs only that plus a
// little sleeve lip.
const nameBandHeightFrac = 0.13

// detectCards builds the sleeve-color mask, splits the photo into per-column
// regions, and returns one cardTop per visible sleeve top, top to bottom within
// each column.
func detectCards(img gocv.Mat, pal SleevePalette) ([]cardTop, error) {
	if img.Empty() {
		return nil, errors.New("detectCards: input image is empty")
	}
	mask := buildSleeveMask(img, pal)
	defer mask.Close()

	cardHeightEstimate := float64(img.Rows()) / cardHeightDivisor
	cardWidthEstimate := cardHeightEstimate * cardAspectWidthOverHeight

	columnRects := detectColumnRects(mask, int(cardWidthEstimate))
	logrus.WithField("columns", len(columnRects)).Debug("detectCards")

	var cards []cardTop
	for _, columnRect := range columnRects {
		// Within each column, snap to card top edges (light sleeve over dark border).
		tops := findCardTops(img, mask, columnRect, int(cardHeightEstimate))
		sort.SliceStable(tops, func(i, j int) bool { return tops[i].midY() < tops[j].midY() })
		cards = append(cards, tops...)
	}
	return cards, nil
}

// columnValley is a stretch of the x-projection too empty to hold a card, from
// start up to but not including end.
type columnValley struct {
	start int
	end   int
}

// detectColumnRects segments the image into per-column rectangles by projecting
// the sleeve mask onto the x-axis and finding deep valleys (between-column gaps).
// Each non-valley span becomes one column rect, spanning the full image height.
//
// Projection beats connected components here: when cards in adjacent columns
// touch, their components merge, but the projection at the touch point still
// drops sharply because the surrounding inter-column space is mostly black.
func detectColumnRects(mask gocv.Mat, cardWidth int) []image.Rectangle {
	if cardWidth <= 0 {
		return nil
	}
	cols := mask.Cols()
	rows := mask.Rows()

	smoothWindow := max(columnMinSpanPx, int(float64(cardWidth)*columnSmoothWidthFrac))
	smoothed := smoothRollingSum(projectOntoX(mask), smoothWindow)

	peak := 0
	for _, value := range smoothed {
		peak = max(peak, value)
	}
	if peak == 0 {
		return nil
	}
	threshold := int(float64(peak) * columnValleyThreshFrac)
	minValleyWidth := max(columnMinSpanPx, int(float64(cardWidth)*columnMinValleyWidthFrac))
	minColumnWidth := int(float64(cardWidth) * columnMinWidthFrac)

	valleys := findValleys(smoothed, threshold, minValleyWidth)
	logrus.WithFields(logrus.Fields{
		"cols":    cols,
		"valleys": len(valleys),
		"maxVal":  peak,
		"thresh":  threshold,
		"minRun":  minValleyWidth,
		"smoothW": smoothWindow,
		"cardW":   cardWidth,
	}).Debug("detectColumnRects")

	// Each span between the end of one valley and the start of the next is a
	// column; drop columns too narrow to hold a card.
	var columns []image.Rectangle
	spanStart := 0
	addColumn := func(spanEnd int) {
		if spanEnd > spanStart && spanEnd-spanStart >= minColumnWidth {
			columns = append(columns, image.Rect(spanStart, 0, spanEnd, rows))
		}
	}
	for _, valley := range valleys {
		addColumn(valley.start)
		spanStart = valley.end
	}
	addColumn(cols)
	return columns
}

// projectOntoX counts the on-pixels in each column of mask.
func projectOntoX(mask gocv.Mat) []int {
	profile := make([]int, mask.Cols())
	for y := 0; y < mask.Rows(); y++ {
		for x := range profile {
			if mask.GetUCharAt(y, x) > 0 {
				profile[x]++
			}
		}
	}
	return profile
}

// smoothRollingSum replaces each entry with the sum of the entries within
// window/2 on either side (clipped at the ends), which kills single-pixel noise.
func smoothRollingSum(profile []int, window int) []int {
	smoothed := make([]int, len(profile))
	for x := range profile {
		lo := max(x-window/2, 0)
		hi := min(x+window/2, len(profile)-1)
		for k := lo; k <= hi; k++ {
			smoothed[x] += profile[k]
		}
	}
	return smoothed
}

// findValleys returns the stretches of profile at or below threshold that are at
// least minWidth wide. A valley touching the left or right end counts as
// "outside any column", so callers don't emit huge empty border rects.
func findValleys(profile []int, threshold, minWidth int) []columnValley {
	var valleys []columnValley
	inValley := profile[0] <= threshold
	valleyStart := 0
	for x, value := range profile {
		if value <= threshold {
			if !inValley {
				inValley = true
				valleyStart = x
			}
		} else if inValley {
			if x-valleyStart >= minWidth {
				valleys = append(valleys, columnValley{start: valleyStart, end: x})
			}
			inValley = false
		}
	}
	if inValley && len(profile)-valleyStart >= minWidth {
		valleys = append(valleys, columnValley{start: valleyStart, end: len(profile)})
	}
	return valleys
}

// nameBandBbox returns the axis-aligned bounding box, in source-image
// coordinates, of the name strip cropNameBand OCRs. Returning the strip region
// (not the whole card) keeps the UI overlay aligned with where the matched text
// came from. Assumes a non-degenerate top edge.
func nameBandBbox(src gocv.Mat, top cardTop) Bbox {
	thickness := float64(nameBandThickness(top.length()))

	// Drop a perpendicular from the top edge by the strip thickness to get 4 corners.
	radians := top.angleDeg * math.Pi / 180.0
	perpendicularX := -math.Sin(radians)
	perpendicularY := math.Cos(radians)
	corners := [4]image.Point{
		top.left,
		top.right,
		{X: top.right.X + int(perpendicularX*thickness), Y: top.right.Y + int(perpendicularY*thickness)},
		{X: top.left.X + int(perpendicularX*thickness), Y: top.left.Y + int(perpendicularY*thickness)},
	}

	// Axis-aligned bounds of the 4 corners, clamped to the image.
	minX, minY := corners[0].X, corners[0].Y
	maxX, maxY := corners[0].X, corners[0].Y
	for _, corner := range corners[1:] {
		minX = min(minX, corner.X)
		minY = min(minY, corner.Y)
		maxX = max(maxX, corner.X)
		maxY = max(maxY, corner.Y)
	}
	minX = max(minX, 0)
	minY = max(minY, 0)
	maxX = min(maxX, src.Cols())
	maxY = min(maxY, src.Rows())
	return Bbox{X: minX, Y: minY, Width: maxX - minX, Height: maxY - minY}
}

// nameBandThickness is the perpendicular thickness, in pixels, of the name strip
// cropNameBand extracts. It's derived from the card's measured width (the
// detected top-edge length) and the card aspect ratio, so it tracks each card's
// actual size on the photo, whatever the zoom, resolution, or layout.
func nameBandThickness(cardWidthPx float64) int {
	cardHeight := cardWidthPx / cardAspectWidthOverHeight
	return max(minNameBandThickness, int(cardHeight*nameBandHeightFrac))
}

// cropNameBand returns the name strip for a detected card as a new Mat that the
// caller must Close. It extracts a rotated band running perpendicular into the
// card from the detected top edge, so it never needs the full card height.
// Returns an empty Mat if the band would be degenerate.
func cropNameBand(src gocv.Mat, top cardTop) gocv.Mat {
	length := top.length()
	if length < minTopEdgeLength {
		return gocv.NewMat()
	}
	thickness := nameBandThickness(length)
	mid := image.Pt((top.left.X+top.right.X)/2, (top.left.Y+top.right.Y)/2)

	// Rotate around mid by +angleDeg to level the top edge, then shift the strip's
	// top-left corner to the output origin. OpenCV's positive angle is CCW on
	// screen, which un-tilts an edge sloping down-right.
	rotation := gocv.GetRotationMatrix2D(mid, top.angleDeg, 1.0)
	defer rotation.Close()
	stripLength := int(length)
	shiftX := rotation.GetDoubleAt(0, 2) - float64(mid.X-stripLength/2)
	shiftY := rotation.GetDoubleAt(1, 2) - float64(mid.Y)
	rotation.SetDoubleAt(0, 2, shiftX)
	rotation.SetDoubleAt(1, 2, shiftY)

	strip := gocv.NewMat()
	gocv.WarpAffine(src, &strip, rotation, image.Pt(stripLength, thickness))
	if strip.Empty() {
		strip.Close()
		return gocv.NewMat()
	}
	return strip
}

// readRotatedImage loads imagePath and rotates it clockwise by rotateDegrees
// (0, 90, 180, or 270). The caller must Close the returned Mat.
func readRotatedImage(imagePath string, rotateDegrees int) (gocv.Mat, error) {
	src := gocv.IMRead(imagePath, gocv.IMReadColor)
	if src.Empty() {
		src.Close()
		return gocv.Mat{}, fmt.Errorf("could not load image %q", imagePath)
	}

	var rotateCode gocv.RotateFlag
	switch rotateDegrees {
	case 0:
		return src, nil
	case 90:
		rotateCode = gocv.Rotate90Clockwise
	case 180:
		rotateCode = gocv.Rotate180Clockwise
	case 270:
		rotateCode = gocv.Rotate90CounterClockwise
	default:
		src.Close()
		return gocv.Mat{}, fmt.Errorf("rotation must be 0, 90, 180, or 270 degrees; got %d", rotateDegrees)
	}
	defer src.Close()
	rotated := gocv.NewMat()
	gocv.Rotate(src, &rotated, rotateCode)
	return rotated, nil
}

// cardOCR is the outcome of OCRing one detected card's name strip.
type cardOCR struct {
	result MatchResult

	// empty is set when the name strip came out degenerate, so nothing was OCR'd.
	empty bool

	// err is set when tesseract failed on this card.
	err error
}

// ocrCard crops the name strip for one detected card, OCRs it with every
// strategy, and matches the best reading against the cube.
func ocrCard(src gocv.Mat, top cardTop, cube *types.Cube) cardOCR {
	strip := cropNameBand(src, top)
	defer strip.Close()
	if strip.Empty() {
		return cardOCR{empty: true}
	}

	ocrSem <- struct{}{}
	texts, err := runOCRStrategies(strip, defaultOCRStrategies)
	<-ocrSem
	if err != nil {
		return cardOCR{err: err}
	}
	result := pickBestOCRMatch(texts, cube)
	result.Bbox = nameBandBbox(src, top)
	return cardOCR{result: result}
}

// DetectAndMatch loads the image, detects card tops by their sleeve color, OCRs
// each card's name band, fuzzy-matches it against the cube, and returns one
// MatchResult per accepted card (after anchor dedupe).
func DetectAndMatch(imagePath string, cube *types.Cube, opts DetectOptions) ([]MatchResult, error) {
	src, err := readRotatedImage(imagePath, opts.RotateDegrees)
	if err != nil {
		return nil, err
	}
	defer src.Close()

	pal := opts.Sleeve
	if pal == (SleevePalette{}) {
		pal = defaultSleevePalette
	}
	cards, err := detectCards(src, pal)
	if err != nil {
		return nil, err
	}

	// OCR dominates wall-clock (several tesseract calls per card), so OCR cards
	// concurrently, bounded by ocrSem. Results land by index, and matches are
	// collected sequentially afterward so output stays in card order.
	outcomes := make([]cardOCR, len(cards))
	var wg sync.WaitGroup
	for i, card := range cards {
		wg.Add(1)
		go func() {
			defer wg.Done()
			outcomes[i] = ocrCard(src, card, cube)
		}()
	}
	wg.Wait()

	var matches []MatchResult
	for i, outcome := range outcomes {
		if outcome.empty {
			continue
		}
		if outcome.err != nil {
			logrus.WithError(outcome.err).WithField("card_index", i).Warn("skip card: tesseract failed")
			continue
		}
		if outcome.result.Band == ConfidenceUnmatched {
			continue
		}
		matches = append(matches, outcome.result)
	}
	deduped := dedupeByAnchor(matches)
	logrus.WithFields(logrus.Fields{
		"detected": len(cards),
		"matched":  len(deduped),
	}).Debug("DetectAndMatch complete")
	return deduped, nil
}
