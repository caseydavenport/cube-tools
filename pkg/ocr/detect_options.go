package ocr

// DetectOptions holds tunables for the OCR pipeline.
type DetectOptions struct {
	// RotateDegrees rotates the image clockwise by 0, 90, 180, or 270 degrees
	// before processing. Other values are rejected.
	RotateDegrees int

	// KeepCardCrops, if true, persists each per-card image and exposes its
	// path on the corresponding MatchResult.
	KeepCardCrops bool

	// SleeveColor names a preset sleeve color (e.g. "orange") used to look up
	// the HSV hue range. Ignored if SleeveHueRange is set explicitly.
	SleeveColor string

	// SleeveHueRange is the inclusive [hueLo, hueHi] window (OpenCV 0-179)
	// used to build the sleeve mask. If both bounds are zero the pipeline
	// falls back to SleeveColor or auto-detection.
	SleeveHueRange [2]int
}
