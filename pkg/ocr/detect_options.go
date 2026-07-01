package ocr

// DetectOptions holds tunables for the OCR pipeline.
type DetectOptions struct {
	// RotateDegrees rotates the image clockwise by 0, 90, 180, or 270 degrees
	// before processing. Other values are rejected.
	RotateDegrees int

	// Sleeve is the HSV color band used to isolate this cube's sleeves. The
	// zero value means "unset"; the pipeline falls back to DefaultSleevePalette.
	Sleeve SleevePalette
}
