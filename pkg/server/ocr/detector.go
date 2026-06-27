package ocr

import (
	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Detector runs the OCR pipeline. The production implementation requires a
// binary built with `-tags ocr_cv`; without it the underlying calls return an
// error explaining how to rebuild.
type Detector interface {
	DetectPhoto(imagePath string, cube *types.Cube) ([]ocrpkg.MatchResult, error)
	MatchRegion(imagePath string, box ocrpkg.Bbox, cube *types.Cube) (ocrpkg.MatchResult, error)
}

type pipelineDetector struct{}

func NewDetector() Detector { return pipelineDetector{} }

func (pipelineDetector) DetectPhoto(imagePath string, cube *types.Cube) ([]ocrpkg.MatchResult, error) {
	return ocrpkg.DetectAndMatch(imagePath, cube, ocrpkg.DetectOptions{})
}

func (pipelineDetector) MatchRegion(imagePath string, box ocrpkg.Bbox, cube *types.Cube) (ocrpkg.MatchResult, error) {
	return ocrpkg.MatchRegion(imagePath, box, cube, ocrpkg.DetectOptions{})
}

type LineJSON struct {
	DetectedText string             `json:"detected_text"`
	Bbox         ocrpkg.Bbox        `json:"bbox"`
	Band         string             `json:"confidence_band"`
	Chosen       string             `json:"chosen,omitempty"`
	Candidates   []ocrpkg.Candidate `json:"candidates,omitempty"`
}

func toLineJSON(r ocrpkg.MatchResult) LineJSON {
	jl := LineJSON{
		DetectedText: r.DetectedText,
		Bbox:         r.Bbox,
		Band:         bandString(r.Band),
		Candidates:   r.Candidates,
	}
	if r.Band != ocrpkg.ConfidenceUnmatched && len(r.Candidates) > 0 {
		jl.Chosen = r.Candidates[0].Name
	}
	return jl
}

func bandString(b ocrpkg.Confidence) string {
	switch b {
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
