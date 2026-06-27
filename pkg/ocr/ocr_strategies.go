//go:build ocr_cv

package ocr

import (
	"fmt"
	"image"
	"os"

	"github.com/sirupsen/logrus"
	"gocv.io/x/gocv"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// OCRStrategy is one tesseract invocation: how to preprocess the name strip,
// and which page-segmentation mode (PSM) to run. No single strategy wins on
// every card, so we run several and let the matcher pick the best.
type OCRStrategy struct {
	Name string

	// Scale upsizes the strip before OCR; tesseract reads small text poorly.
	Scale float64

	// PSM is tesseract's page-segmentation mode (how it expects text laid out).
	PSM int

	// CropTopFrac chops this fraction off the top of the strip first. The strip
	// sometimes catches the brown sleeve edge of the card above, which confuses
	// tesseract's line finding; cropping it forces focus on the title row.
	CropTopFrac float64

	// Binarize converts the strip to white-text-on-black via Otsu thresholding,
	// which auto-picks the cutoff from the strip's histogram. Boldt et al. (2019)
	// found this roughly doubled tesseract's accuracy on MTG titles.
	Binarize bool
}

// DefaultOCRStrategies is the set runOCRStrategies tries per strip; the matcher
// scores them all and keeps the best. Add entries here to widen the search.
var DefaultOCRStrategies = []OCRStrategy{
	// PSM 6 on the raw strip handles most title bars.
	{Name: "psm6_1x", Scale: 1.0, PSM: 6},

	// PSM 7 on a 2x upscale recovers very short titles (e.g. "Six").
	{Name: "psm7_2x", Scale: 2.0, PSM: 7},

	// PSM 3 (auto layout) on 3x recovers titles on light backgrounds, where
	// PSM 6 fixates on the icons and gives up.
	{Name: "psm3_3x", Scale: 3.0, PSM: 3},

	// 4x and drop the top half, for strips bleeding the card above.
	{Name: "psm6_bot_4x", Scale: 4.0, PSM: 6, CropTopFrac: 0.5},

	// Black-and-white pass for low-contrast titles.
	{Name: "psm6_bin_1x", Scale: 1.0, PSM: 6, Binarize: true},
}

// runOCRStrategies runs every strategy against the strip and returns the OCR'd
// text from each. The strip is neither modified nor closed; the caller owns it.
// Errors only if tesseract is missing or a call fails - empty OCR output is not
// an error.
func runOCRStrategies(strip gocv.Mat, strategies []OCRStrategy) ([]string, error) {
	texts := make([]string, 0, len(strategies))
	for _, s := range strategies {
		path, err := writeStrategyStrip(strip, s)
		if err != nil {
			return nil, fmt.Errorf("strategy %s: %w", s.Name, err)
		}
		text, err := RunTesseractLine(path, s.PSM)
		if rmErr := os.Remove(path); rmErr != nil {
			logrus.WithError(rmErr).WithField("path", path).Debug("failed to remove temp OCR strip")
		}
		if err != nil {
			return nil, fmt.Errorf("strategy %s: %w", s.Name, err)
		}
		texts = append(texts, text)
	}
	return texts, nil
}

// writeStrategyStrip applies the strategy's preprocessing and writes the result
// to a temp PNG for tesseract to read.
func writeStrategyStrip(strip gocv.Mat, s OCRStrategy) (string, error) {
	src := strip

	// Crop the top off first, before scaling, to drop bleed from the card above.
	if s.CropTopFrac > 0 && s.CropTopFrac < 1 {
		cropY := int(float64(strip.Rows()) * s.CropTopFrac)
		if cropY < strip.Rows() {
			roi := strip.Region(image.Rect(0, cropY, strip.Cols(), strip.Rows()))
			defer roi.Close()
			src = roi
		}
	}

	// Upscale so tesseract sees larger glyphs.
	if s.Scale != 1.0 {
		resized := gocv.NewMat()
		defer resized.Close()
		gocv.Resize(src, &resized, image.Point{}, s.Scale, s.Scale, gocv.InterpolationCubic)
		src = resized
	}

	// Flatten to black-and-white text when asked.
	if s.Binarize {
		bin := binarizeAndInvert(src)
		defer bin.Close()
		src = bin
	}
	return writeMatToTempPNG(src, "ocr-strip-*.png")
}

// binarizeAndInvert turns a BGR or grayscale strip into white-text-on-black
// using Otsu thresholding, which picks the black/white cutoff from the strip's
// own brightness histogram. Caller owns the returned Mat.
func binarizeAndInvert(src gocv.Mat) gocv.Mat {
	gray := gocv.NewMat()
	if src.Channels() == 1 {
		src.CopyTo(&gray)
	} else {
		gocv.CvtColor(src, &gray, gocv.ColorBGRToGray)
	}
	defer gray.Close()

	out := gocv.NewMat()
	gocv.Threshold(gray, &out, 0, 255, gocv.ThresholdBinaryInv|gocv.ThresholdOtsu)
	return out
}

// pickBestOCRMatch matches every OCR text against the cube and returns the
// highest-scoring result. Order breaks ties: earlier strategies win.
func pickBestOCRMatch(texts []string, cube *types.Cube) MatchResult {
	var best MatchResult
	for i, text := range texts {
		r := MatchLine(text, cube)
		if i == 0 || r.Top().Score > best.Top().Score {
			best = r
		}
	}
	return best
}

// writeMatToTempPNG writes m to a new temp PNG matching pattern and returns its
// path. Caller is responsible for removing the file.
func writeMatToTempPNG(m gocv.Mat, pattern string) (string, error) {
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", err
	}
	path := f.Name()
	if err := f.Close(); err != nil {
		logrus.WithError(err).WithField("path", path).Debug("failed to close temp file")
	}
	if !gocv.IMWrite(path, m) {
		if err := os.Remove(path); err != nil {
			logrus.WithError(err).WithField("path", path).Debug("failed to remove temp file")
		}
		return "", fmt.Errorf("failed to write %s", path)
	}
	return path, nil
}
