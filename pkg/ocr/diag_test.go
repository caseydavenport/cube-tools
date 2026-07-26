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

	"github.com/caseydavenport/cube-tools/pkg/types"
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
	cube, err := types.LoadCubeList(types.LoadOptions{
		DataRoot: dataRoot,
		Cube:     "polyverse",
		Date:     os.Getenv("DIAG_DRAFT"),
	})
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
	mask := BuildSleeveMask(src, DefaultSleevePalette)
	defer mask.Close()
	if out := os.Getenv("DIAG_MASK_OUT"); out != "" {
		gocv.IMWrite(out, mask)
		t.Logf("wrote mask to %s", out)
	}
	cols, maskRows := mask.Cols(), mask.Rows()
	profile := make([]int, cols)
	for y := 0; y < maskRows; y++ {
		for x := 0; x < cols; x++ {
			if mask.GetUCharAt(y, x) > 0 {
				profile[x]++
			}
		}
	}
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
	cardHeightEstimate := maskRows / 7
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

	cards, err := DetectCards(src, DefaultSleevePalette)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("detected cards: %d", len(cards))

	// Run refineCardEdges over the WHOLE image as one region and dump the raw
	// sleeve-to-card transition map. This shows whether card top edges are being
	// marked at all, independent of column segmentation.
	chEst := int(float64(src.Rows()) / CardHeightDivisor)
	fullRect := image.Rect(0, 0, src.Cols(), src.Rows())
	refinedFull, bottoms := refineCardEdges(src, mask, fullRect, chEst)
	defer bottoms.Close()
	t.Logf("refineCardEdges over full image: %d card tops found", len(refinedFull))
	if out := os.Getenv("DIAG_BOTTOMS_OUT"); out != "" {
		gocv.IMWrite(out, bottoms)
		t.Logf("wrote transitions to %s", out)
	}

	// Per-column breakdown so we can see how segmentation splits the image.
	colRects := detectColumnRects(mask, int(float64(chEst)*CardAspectWidthOverHeight))
	t.Logf("detectColumnRects: %d columns", len(colRects))
	for i, cr := range colRects {
		rf, m := refineCardEdges(src, mask, cr, chEst)
		m.Close()
		t.Logf("  col %d: x=[%d,%d] w=%d -> %d card tops", i, cr.Min.X, cr.Max.X, cr.Dx(), len(rf))
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
	for i, c := range cards {
		i, c := i, c
		wg.Add(1)
		go func() {
			defer wg.Done()
			strip := CropNameBand(src, c)
			defer strip.Close()
			rows[i].idx = i
			if strip.Empty() {
				rows[i].text = "<empty strip>"
				return
			}
			rows[i].stripW = strip.Cols()
			rows[i].stripH = strip.Rows()
			ocrSem <- struct{}{}
			texts, err := runOCRStrategies(strip, DefaultOCRStrategies)
			<-ocrSem
			if err != nil {
				rows[i].text = "ERR: " + err.Error()
				return
			}
			r := pickBestOCRMatch(texts, cube)
			rows[i].text = r.DetectedText
			rows[i].top = r.Top()
			rows[i].band = r.Band
		}()
	}
	wg.Wait()

	matched := 0
	for _, r := range rows {
		if r.band != ConfidenceUnmatched {
			matched++
		}
		fmt.Printf("[%2d] strip=%dx%d band=%d score=%.2f name=%-28q ocr=%q\n",
			r.idx, r.stripW, r.stripH, r.band, r.top.Score, r.top.Name, r.text)
	}
	t.Logf("MATCHED %d / %d detected", matched, len(cards))
}
