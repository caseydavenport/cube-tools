//go:build ocr_cv

package ocr

import (
	"errors"
	"image"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// MatchRegion OCRs a single user-specified box and matches it against the cube.
// The box is in source-image coordinates (after any rotation in opts) and is
// treated as a name strip: no card detection happens, the box is the strip.
// This backs the UI's manual region-select, where a person draws a box around a
// title the automatic detector missed.
func MatchRegion(imagePath string, box Bbox, cube *types.Cube, opts DetectOptions) (MatchResult, error) {
	src, err := readRotatedImage(imagePath, opts.RotateDegrees)
	if err != nil {
		return MatchResult{}, err
	}
	defer src.Close()

	// Clamp the box to the image so an out-of-bounds drag doesn't panic Region.
	rect := image.Rect(box.X, box.Y, box.X+box.Width, box.Y+box.Height)
	rect = rect.Intersect(image.Rect(0, 0, src.Cols(), src.Rows()))
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return MatchResult{}, errors.New("region box is empty after clamping")
	}

	// Region is a view into src; clone it so the strip owns its pixels and the
	// OCR temp-file writes aren't aliasing src's buffer.
	region := src.Region(rect)
	defer region.Close()
	strip := region.Clone()
	defer strip.Close()

	texts, err := runOCRStrategies(strip, defaultOCRStrategies)
	if err != nil {
		return MatchResult{}, err
	}
	result := pickBestOCRMatch(texts, cube)
	result.Bbox = box
	return result, nil
}
