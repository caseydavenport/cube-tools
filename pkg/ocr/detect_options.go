package ocr

// DetectOptions holds tunables for the OCR pipeline.
type DetectOptions struct {
	// RotateDegrees rotates the image clockwise by 0, 90, 180, or 270 degrees
	// before processing. Other values are rejected.
	RotateDegrees int
}
