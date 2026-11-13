package ocr

import (
	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Detector runs the OCR pipeline. The production implementation requires a
// binary built with `-tags ocr_cv`; without it the underlying calls return an
// error explaining how to rebuild.
type Detector interface {
	DetectPhoto(imagePath string, cube *types.Cube, sleeveColor string) ([]ocrpkg.MatchResult, error)
	MatchRegion(imagePath string, box ocrpkg.Bbox, cube *types.Cube) (ocrpkg.MatchResult, error)
}

type pipelineDetector struct{}

// NewDetector returns the production detector, which runs the OpenCV and
// tesseract pipeline in pkg/ocr.
func NewDetector() Detector {
	return pipelineDetector{}
}

// DetectPhoto finds every card-name region in the photo and matches each one
// against the cube, using the palette for the cube's sleeve color.
func (pipelineDetector) DetectPhoto(imagePath string, cube *types.Cube, sleeveColor string) ([]ocrpkg.MatchResult, error) {
	return ocrpkg.DetectAndMatch(imagePath, cube, ocrpkg.DetectOptions{
		Sleeve: ocrpkg.SleevePaletteByName(sleeveColor),
	})
}

// MatchRegion matches the text inside one region of the photo against the cube.
func (pipelineDetector) MatchRegion(imagePath string, box ocrpkg.Bbox, cube *types.Cube) (ocrpkg.MatchResult, error) {
	return ocrpkg.MatchRegion(imagePath, box, cube, ocrpkg.DetectOptions{})
}

// LineJSON is one detected card-name line as the review page reads it: the
// text OCR saw, where it is, its confidence band, and the cube cards it might
// be. Chosen is the best candidate, empty when nothing matched.
type LineJSON struct {
	DetectedText string             `json:"detected_text"`
	Bbox         ocrpkg.Bbox        `json:"bbox"`
	Band         string             `json:"confidence_band"`
	Chosen       string             `json:"chosen,omitempty"`
	Candidates   []ocrpkg.Candidate `json:"candidates,omitempty"`
}

// toLineJSON converts a match result to its wire form, choosing the top
// candidate unless the match was unmatched.
func toLineJSON(result ocrpkg.MatchResult) LineJSON {
	line := LineJSON{
		DetectedText: result.DetectedText,
		Bbox:         result.Bbox,
		Band:         bandString(result.Band),
		Candidates:   result.Candidates,
	}
	if result.Band != ocrpkg.ConfidenceUnmatched && len(result.Candidates) > 0 {
		line.Chosen = result.Candidates[0].Name
	}
	return line
}

// bandString names a confidence band the way the client and saved boxes do.
func bandString(band ocrpkg.Confidence) string {
	switch band {
	case ocrpkg.ConfidenceHigh:
		return "high"
	case ocrpkg.ConfidenceLow:
		return "low"
	case ocrpkg.ConfidenceVeryLow:
		return "very_low"
	default:
		return "unmatched"
	}
}
