//go:build ocr_cv

package ocr

import (
	"fmt"
	"image"

	"gocv.io/x/gocv"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// MatchRegion OCRs a single user-specified box and matches it against the cube.
// The box is in source-image coordinates (after any rotation in opts) and is
// treated as a name strip - no card detection happens, the box IS the strip.
// This backs the UI's manual region-select, where a person draws a box around a
// title the automatic detector missed.
func MatchRegion(imagePath string, box Bbox, cube *types.Cube, opts DetectOptions) (MatchResult, error) {
	src := gocv.IMRead(imagePath, gocv.IMReadColor)
	if src.Empty() {
		return MatchResult{}, fmt.Errorf("could not load image %q", imagePath)
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
			return MatchResult{}, fmt.Errorf("RotateDegrees must be 0, 90, 180, or 270; got %d", r)
		}
		src.Close()
		src = rotated
	}

	// Clamp the box to the image so an out-of-bounds drag doesn't panic Region.
	rect := image.Rect(box.X, box.Y, box.X+box.Width, box.Y+box.Height)
	rect = rect.Intersect(image.Rect(0, 0, src.Cols(), src.Rows()))
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return MatchResult{}, fmt.Errorf("region box is empty after clamping")
	}
	// Region is a view into src; clone it so the strip owns its pixels and the
	// OCR temp-file writes aren't aliasing src's buffer.
	region := src.Region(rect)
	defer region.Close()
	strip := region.Clone()
	defer strip.Close()

	texts, err := runOCRStrategies(strip, DefaultOCRStrategies)
	if err != nil {
		return MatchResult{}, err
	}
	result := pickBestOCRMatch(texts, cube)
	result.Bbox = box
	return result, nil
}
