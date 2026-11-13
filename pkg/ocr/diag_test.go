//go:build ocr_cv && ocr_diag

package ocr

import (
	"fmt"
	"image"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/sirupsen/logrus"
	"gocv.io/x/gocv"
)

// TestDiagPhoto dumps per-card detection, OCR text, and match scores for a
// single photo. Point DIAG_PHOTO at the image. Build with
// `-tags 'ocr_cv ocr_diag'`.
func TestDiagPhoto(t *testing.T) {
	imgPath := os.Getenv("DIAG_PHOTO")
	if imgPath == "" {
		t.Skip("set DIAG_PHOTO")
	}
	if os.Getenv("DIAG_DEBUG") != "" {
		logrus.SetLevel(logrus.DebugLevel)
	}
	dataRoot, err := filepath.Abs(filepath.Join("..", "..", "data"))
	if err != nil {
		t.Fatal(err)
	}
	cube, err := latestPolyverseCube(dataRoot)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("cube names: %d", len(cube.Names()))

	src := gocv.IMRead(imgPath, gocv.IMReadColor)
	if src.Empty() {
		t.Fatalf("could not load %q", imgPath)
	}
	defer src.Close()
	t.Logf("image: %dx%d", src.Cols(), src.Rows())

	// Dump the sleeve mask and its x-projection so we can see column structure.
	mask := buildSleeveMask(src, defaultSleevePalette)
	defer mask.Close()
	if out := os.Getenv("DIAG_MASK_OUT"); out != "" {
		gocv.IMWrite(out, mask)
		t.Logf("wrote mask to %s", out)
	}
	cols, maskRows := mask.Cols(), mask.Rows()
	profile := projectOntoX(mask)

	// Print the profile downsampled to 60 buckets (max per bucket).
	const buckets = 60
	bw := cols / buckets
	var line string
	maxBucket := 0
	bvals := make([]int, buckets)
	for b := 0; b < buckets; b++ {
		mx := 0
		for x := b * bw; x < (b+1)*bw && x < cols; x++ {
			if profile[x] > mx {
				mx = profile[x]
			}
		}
		bvals[b] = mx
		if mx > maxBucket {
			maxBucket = mx
		}
	}
	for b := 0; b < buckets; b++ {
		h := 0
		if maxBucket > 0 {
			h = bvals[b] * 9 / maxBucket
		}
		line += fmt.Sprintf("%d", h)
	}
	t.Logf("x-projection (60 buckets, 0-9 scale, maxcol=%d, rows=%d):\n%s", maxBucket, maskRows, line)

	// Connected-components: how many big blobs (candidate columns) emerge?
	labels := gocv.NewMat()
	defer labels.Close()
	stats := gocv.NewMat()
	defer stats.Close()
	centroids := gocv.NewMat()
	defer centroids.Close()
	n := gocv.ConnectedComponentsWithStats(mask, &labels, &stats, &centroids)
	cardHeightEstimate := int(float64(maskRows) / cardHeightDivisor)
	bigBlobs := 0

	// Stat columns: 0=left 1=top 2=width 3=height 4=area.
	for i := 1; i < n; i++ {
		x := int(stats.GetIntAt(i, 0))
		w := int(stats.GetIntAt(i, 2))
		h := int(stats.GetIntAt(i, 3))
		area := int(stats.GetIntAt(i, 4))
		if h >= cardHeightEstimate {
			bigBlobs++
			t.Logf("blob %d: x=%d w=%d h=%d area=%d", i, x, w, h, area)
		}
	}
	t.Logf("connected components: %d total, %d tall (>= %dpx)", n-1, bigBlobs, cardHeightEstimate)

	cards, err := detectCards(src, defaultSleevePalette)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("detected cards: %d", len(cards))

	// Run findCardTops over the WHOLE image as one region and dump the raw
	// sleeve-to-card transition map. This shows whether card top edges are being
	// marked at all, independent of column segmentation.
	chEst := int(float64(src.Rows()) / cardHeightDivisor)
	fullRect := image.Rect(0, 0, src.Cols(), src.Rows())
	topsFull := findCardTops(src, mask, fullRect, chEst)
	bottoms := markSleeveBottoms(mask, fullRect)
	defer bottoms.Close()
	t.Logf("findCardTops over full image: %d card tops found", len(topsFull))
	if out := os.Getenv("DIAG_BOTTOMS_OUT"); out != "" {
		gocv.IMWrite(out, bottoms)
		t.Logf("wrote transitions to %s", out)
	}

	// Per-column breakdown so we can see how segmentation splits the image.
	colRects := detectColumnRects(mask, int(float64(chEst)*cardAspectWidthOverHeight))
	t.Logf("detectColumnRects: %d columns", len(colRects))
	for i, cr := range colRects {
		tops := findCardTops(src, mask, cr, chEst)
		t.Logf("  col %d: x=[%d,%d] w=%d -> %d card tops", i, cr.Min.X, cr.Max.X, cr.Dx(), len(tops))
	}

	type row struct {
		idx    int
		text   string
		top    Candidate
		band   Confidence
		stripW int
		stripH int
	}
	rows := make([]row, len(cards))
	var wg sync.WaitGroup
	for index, card := range cards {
		wg.Add(1)
		go func() {
			defer wg.Done()
			strip := cropNameBand(src, card)
			defer strip.Close()
			rows[index].idx = index
			if strip.Empty() {
				rows[index].text = "<empty strip>"
				return
			}
			rows[index].stripW = strip.Cols()
			rows[index].stripH = strip.Rows()
			ocrSem <- struct{}{}
			texts, err := runOCRStrategies(strip, defaultOCRStrategies)
			<-ocrSem
			if err != nil {
				rows[index].text = "ERR: " + err.Error()
				return
			}
			result := pickBestOCRMatch(texts, cube)
			rows[index].text = result.DetectedText
			rows[index].top = result.Top()
			rows[index].band = result.Band
		}()
	}
	wg.Wait()

	matched := 0
	for _, r := range rows {
		if r.band != ConfidenceUnmatched {
			matched++
		}
		fmt.Printf("[%2d] strip=%dx%d band=%d score=%.2f name=%-28q ocr=%q\n", r.idx, r.stripW, r.stripH, r.band, r.top.Score, r.top.Name, r.text)
	}
	t.Logf("MATCHED %d / %d detected", matched, len(cards))
}
