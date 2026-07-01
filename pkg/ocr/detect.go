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

// ocrSem bounds how many tesseract processes run at once across the whole
// program. Each card is OCR'd with several strategies, cards run concurrently
// within a photo, and photos run concurrently server-side, so without a global
// cap we'd spawn far more tesseract processes than cores. Sized to NumCPU.
var ocrSem = make(chan struct{}, max(1, runtime.NumCPU()))

// CardHeightDivisor is the assumed number of card heights that stack vertically
// in a typical photo; it turns image height into a card-height estimate.
const CardHeightDivisor = 7.0

// CardAspectWidthOverHeight is the MTG card aspect ratio (63mm / 88mm), used to
// estimate card width from the height estimate.
const CardAspectWidthOverHeight = 63.0 / 88.0

// ColumnValleyThreshFrac: a column in the x-projection is a between-column gap
// when its smoothed sleeve-pixel count falls below this fraction of the peak.
// Set very low because the dip between a card's two vertical edges is ~5% of
// peak, while a true inter-column gap is near zero - the threshold sits between.
const ColumnValleyThreshFrac = 0.03

// ColumnMinValleyWidthFrac: a gap must be at least this fraction of the card
// width to count as a real inter-column gap. Tight layouts can have gaps as
// narrow as ~10px, so keep it small.
const ColumnMinValleyWidthFrac = 0.04

// ColumnSmoothWidthFrac: the rolling-sum smoothing window for the x-projection,
// as a fraction of card width. Wide enough to suppress single-pixel noise, narrow
// enough to preserve real gaps.
const ColumnSmoothWidthFrac = 1.0 / 60.0

// ColumnMinWidthFrac: a candidate column must be at least this fraction of the
// card width to keep, filtering slivers between two close gaps.
const ColumnMinWidthFrac = 0.35

// DetectedCard is a single card detection. Bbox is the sleeve region (handy for
// overlays); Refined is the card-border-snapped rect and tilt angle used to crop
// the name strip.
type DetectedCard struct {
	Bbox    Bbox
	RidgeY  int
	Refined RefinedCard
}

// DetectCards builds the sleeve-color mask, splits the photo into per-column
// regions, and returns one DetectedCard per visible sleeve top.
func DetectCards(img gocv.Mat, pal SleevePalette) ([]DetectedCard, error) {
	if img.Empty() {
		return nil, errors.New("DetectCards: input image is empty")
	}
	mask := BuildSleeveMask(img, pal)
	defer mask.Close()

	cardHeightEstimate := float64(img.Rows()) / CardHeightDivisor
	cardWidthEstimate := cardHeightEstimate * CardAspectWidthOverHeight

	columnRects := detectColumnRects(mask, int(cardWidthEstimate))
	logrus.WithField("columns", len(columnRects)).Debug("DetectCards")

	var out []DetectedCard
	for _, colRect := range columnRects {
		// Within each column, snap to card top edges (light sleeve over dark border).
		refined, masked := refineCardEdges(img, mask, colRect, int(cardHeightEstimate))
		masked.Close()
		if len(refined) == 0 {
			continue
		}

		// Clip stacked cards so each box stops at the next card's top edge.
		clipColumnCardRects(refined)
		for _, rc := range refined {
			midY := (rc.TopEdge[0].Y + rc.TopEdge[1].Y) / 2
			out = append(out, DetectedCard{
				Bbox:    Bbox{X: rc.Rect.Min.X, Y: rc.Rect.Min.Y, Width: rc.Rect.Dx(), Height: rc.Rect.Dy()},
				RidgeY:  midY,
				Refined: rc,
			})
		}
	}
	return out, nil
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

	// Count on-pixels per column.
	profile := make([]int, cols)
	for y := 0; y < rows; y++ {
		for x := 0; x < cols; x++ {
			if mask.GetUCharAt(y, x) > 0 {
				profile[x]++
			}
		}
	}

	// Smooth the profile with a rolling sum to kill single-pixel noise.
	smoothW := int(float64(cardWidth) * ColumnSmoothWidthFrac)
	if smoothW < 3 {
		smoothW = 3
	}
	smoothed := make([]int, cols)
	for x := 0; x < cols; x++ {
		lo := x - smoothW/2
		hi := x + smoothW/2
		if lo < 0 {
			lo = 0
		}
		if hi >= cols {
			hi = cols - 1
		}
		for k := lo; k <= hi; k++ {
			smoothed[x] += profile[k]
		}
	}

	maxVal := 0
	for _, v := range smoothed {
		if v > maxVal {
			maxVal = v
		}
	}
	if maxVal == 0 {
		return nil
	}
	threshold := int(float64(maxVal) * ColumnValleyThreshFrac)
	minRun := int(float64(cardWidth) * ColumnMinValleyWidthFrac)
	if minRun < 3 {
		minRun = 3
	}
	minColWidth := int(float64(cardWidth) * ColumnMinWidthFrac)

	// Find valley runs: stretches below threshold at least minRun wide. Leading
	// and trailing valleys count as "outside any column" so we don't emit huge
	// empty border rects.
	type run struct{ start, end int }
	var valleys []run
	inValley := smoothed[0] <= threshold
	runStart := 0
	for x, v := range smoothed {
		if v <= threshold {
			if !inValley {
				inValley = true
				runStart = x
			}
		} else if inValley {
			if x-runStart >= minRun {
				valleys = append(valleys, run{runStart, x})
			}
			inValley = false
		}
	}
	if inValley && cols-runStart >= minRun {
		valleys = append(valleys, run{runStart, cols})
	}

	logrus.WithFields(logrus.Fields{
		"cols":    cols,
		"valleys": len(valleys),
		"maxVal":  maxVal,
		"thresh":  threshold,
		"minRun":  minRun,
		"smoothW": smoothW,
		"cardW":   cardWidth,
	}).Debug("detectColumnRects")

	// Each span between the end of one valley and the start of the next is a column.
	var rects []image.Rectangle
	prev := 0
	for _, v := range valleys {
		if v.start > prev {
			rects = append(rects, image.Rect(prev, 0, v.start, rows))
		}
		prev = v.end
	}
	if prev < cols {
		rects = append(rects, image.Rect(prev, 0, cols, rows))
	}

	// Drop columns too narrow to hold a card.
	var filtered []image.Rectangle
	for _, r := range rects {
		if r.Dx() >= minColWidth {
			filtered = append(filtered, r)
		}
	}
	return filtered
}

// clipColumnCardRects clips each card's bottom to the next card's top edge in
// the same column, so stacked cards don't get overlapping boxes. Modifies refined
// in place.
//
// In a stack only the top sliver of each card shows, but approxCardRect extends
// every box down a full card height. Without this clip each box engulfs its lower
// neighbors, and anchor dedupe then drops real matches when a high-scoring box
// suppresses everyone beneath it.
func clipColumnCardRects(refined []RefinedCard) {
	if len(refined) < 2 {
		return
	}
	sort.SliceStable(refined, func(i, j int) bool {
		mi := (refined[i].TopEdge[0].Y + refined[i].TopEdge[1].Y) / 2
		mj := (refined[j].TopEdge[0].Y + refined[j].TopEdge[1].Y) / 2
		return mi < mj
	})
	for i := 0; i < len(refined)-1; i++ {
		nextTop := (refined[i+1].TopEdge[0].Y + refined[i+1].TopEdge[1].Y) / 2
		cap := nextTop - 1
		if cap <= refined[i].Rect.Min.Y {
			continue
		}
		if cap < refined[i].Rect.Max.Y {
			refined[i].Rect.Max.Y = cap
		}
	}
}

// nameBandBbox returns the axis-aligned bounding box, in source-image
// coordinates, of the name strip CropNameBand actually OCRs. Returning the strip
// region (not the whole-card Bbox) keeps the UI overlay aligned with where the
// matched text came from. Assumes a non-degenerate top edge.
func nameBandBbox(src gocv.Mat, c DetectedCard) Bbox {
	p1 := c.Refined.TopEdge[0]
	p2 := c.Refined.TopEdge[1]
	dx := float64(p2.X - p1.X)
	dy := float64(p2.Y - p1.Y)
	thickness := float64(nameBandThickness(math.Sqrt(dx*dx + dy*dy)))

	// Drop perpendicular from the top edge by the strip thickness to get 4 corners.
	rad := c.Refined.AngleDeg * math.Pi / 180.0
	perpX := -math.Sin(rad)
	perpY := math.Cos(rad)
	pts := [4]image.Point{
		p1,
		p2,
		{X: p2.X + int(perpX*thickness), Y: p2.Y + int(perpY*thickness)},
		{X: p1.X + int(perpX*thickness), Y: p1.Y + int(perpY*thickness)},
	}

	// Axis-aligned bounds of the 4 corners, clamped to the image.
	minX, minY := pts[0].X, pts[0].Y
	maxX, maxY := pts[0].X, pts[0].Y
	for _, p := range pts[1:] {
		minX = min(minX, p.X)
		minY = min(minY, p.Y)
		maxX = max(maxX, p.X)
		maxY = max(maxY, p.Y)
	}
	minX = max(minX, 0)
	minY = max(minY, 0)
	maxX = min(maxX, src.Cols())
	maxY = min(maxY, src.Rows())
	return Bbox{X: minX, Y: minY, Width: maxX - minX, Height: maxY - minY}
}

// NameBandHeightFrac is the name strip's height as a fraction of the card's own
// height. The title bar sits in roughly the top sixth of a card, so this only
// needs to be tall enough to contain it (plus a little for the sleeve lip above);
// taller just feeds the art below the title into OCR as noise.
const NameBandHeightFrac = 0.13

// nameBandThickness is the perpendicular thickness, in pixels, of the name strip
// CropNameBand extracts. It's derived from the card's measured width (the detected
// top-edge length) and the card aspect ratio, so it tracks each card's actual size
// on the photo rather than a global guess about how many cards fill the frame -
// resilient to zoom, resolution, and layout.
func nameBandThickness(cardWidthPx float64) int {
	cardHeight := cardWidthPx / CardAspectWidthOverHeight
	thickness := int(cardHeight * NameBandHeightFrac)
	if thickness < 12 {
		thickness = 12
	}
	return thickness
}

// CropNameBand returns the name strip Mat for a detected card. Caller owns the
// returned Mat. It uses the detected top edge to extract a rotated band running
// perpendicular into the card, so it never needs the full card height. Returns
// an empty Mat if the band would be degenerate.
func CropNameBand(src gocv.Mat, c DetectedCard) gocv.Mat {
	p1 := c.Refined.TopEdge[0]
	p2 := c.Refined.TopEdge[1]
	dx := float64(p2.X - p1.X)
	dy := float64(p2.Y - p1.Y)
	length := math.Sqrt(dx*dx + dy*dy)
	if length < 20 {
		return gocv.NewMat()
	}
	thickness := nameBandThickness(length)
	mid := image.Pt((p1.X+p2.X)/2, (p1.Y+p2.Y)/2)

	// Rotate around mid by +AngleDeg to level the top edge, then shift the strip's
	// top-left corner to the output origin. OpenCV's positive angle is CCW on
	// screen, which un-tilts an edge sloping down-right (positive in our atan2).
	m := gocv.GetRotationMatrix2D(mid, c.Refined.AngleDeg, 1.0)
	defer m.Close()
	stripLen := int(length)
	tx := m.GetDoubleAt(0, 2) - float64(mid.X-stripLen/2)
	ty := m.GetDoubleAt(1, 2) - float64(mid.Y)
	m.SetDoubleAt(0, 2, tx)
	m.SetDoubleAt(1, 2, ty)

	dst := gocv.NewMat()
	gocv.WarpAffine(src, &dst, m, image.Pt(stripLen, thickness))
	if dst.Empty() {
		dst.Close()
		return gocv.NewMat()
	}
	return dst
}

// DetectAndMatch loads the image, detects card tops by their sleeve color, OCRs
// each card's name band, fuzzy-matches it against the cube, and returns one
// MatchResult per accepted card (after anchor dedupe).
func DetectAndMatch(imagePath string, cube *types.Cube, opts DetectOptions) ([]MatchResult, error) {
	src := gocv.IMRead(imagePath, gocv.IMReadColor)
	if src.Empty() {
		return nil, fmt.Errorf("could not load image %q", imagePath)
	}
	// Closure so a reassignment after rotation closes the rotated Mat, not the original.
	defer func() { src.Close() }()

	if r := opts.RotateDegrees; r != 0 {
		rotated := gocv.NewMat()
		switch r {
		case 90:
			gocv.Rotate(src, &rotated, gocv.Rotate90Clockwise)
		case 180:
			gocv.Rotate(src, &rotated, gocv.Rotate180Clockwise)
		case 270:
			gocv.Rotate(src, &rotated, gocv.Rotate90CounterClockwise)
		default:
			rotated.Close()
			return nil, fmt.Errorf("RotateDegrees must be 0, 90, 180, or 270; got %d", r)
		}
		src.Close()
		src = rotated
	}

	pal := opts.Sleeve
	if pal == (SleevePalette{}) {
		pal = DefaultSleevePalette
	}
	cards, err := DetectCards(src, pal)
	if err != nil {
		return nil, err
	}

	// OCR dominates wall-clock (several tesseract calls per card), so OCR cards
	// concurrently, bounded by ocrSem. Results land in ocrd by index; matches are
	// collected sequentially afterward so output stays in card order.
	type cardOCR struct {
		result MatchResult
		empty  bool
		ocrErr error
	}
	ocrd := make([]cardOCR, len(cards))
	var wg sync.WaitGroup
	for i, c := range cards {
		i, c := i, c
		wg.Add(1)
		go func() {
			defer wg.Done()
			r := &ocrd[i]

			// Skip cards whose name strip came out degenerate.
			strip := CropNameBand(src, c)
			defer strip.Close()
			if strip.Empty() {
				r.empty = true
				return
			}

			ocrSem <- struct{}{}
			texts, err := runOCRStrategies(strip, DefaultOCRStrategies)
			<-ocrSem
			if err != nil {
				r.ocrErr = err
				return
			}
			r.result = pickBestOCRMatch(texts, cube)
			r.result.Bbox = nameBandBbox(src, c)
		}()
	}
	wg.Wait()

	var matches []MatchResult
	for i := range ocrd {
		r := &ocrd[i]
		if r.empty {
			continue
		}
		if r.ocrErr != nil {
			logrus.WithError(r.ocrErr).WithField("card_index", i).Warn("skip card: tesseract failed")
			continue
		}
		if r.result.Band == ConfidenceUnmatched {
			continue
		}
		matches = append(matches, r.result)
	}
	deduped := dedupeByAnchor(matches)
	logrus.WithFields(logrus.Fields{
		"detected": len(cards),
		"matched":  len(deduped),
	}).Debug("DetectAndMatch complete")
	return deduped, nil
}
