package ocr

// Bbox is an axis-aligned bounding box in image coordinates.
type Bbox struct {
	X      int
	Y      int
	Width  int
	Height int
}

// overlapFraction returns the intersection area of a and b divided by a's area.
// Returns 0 if a has zero area or there is no overlap.
func overlapFraction(a, b Bbox) float64 {
	aArea := a.Width * a.Height
	if aArea <= 0 {
		return 0
	}
	x1 := max(a.X, b.X)
	y1 := max(a.Y, b.Y)
	x2 := min(a.X+a.Width, b.X+b.Width)
	y2 := min(a.Y+a.Height, b.Y+b.Height)
	if x2 <= x1 || y2 <= y1 {
		return 0
	}
	return float64((x2-x1)*(y2-y1)) / float64(aArea)
}

// bboxIntersectionOverUnion returns the intersection over union of a and b.
// Returns 0 if either has zero area or there is no overlap.
func bboxIntersectionOverUnion(a, b Bbox) float64 {
	aArea := a.Width * a.Height
	bArea := b.Width * b.Height
	if aArea <= 0 || bArea <= 0 {
		return 0
	}
	x1 := max(a.X, b.X)
	y1 := max(a.Y, b.Y)
	x2 := min(a.X+a.Width, b.X+b.Width)
	y2 := min(a.Y+a.Height, b.Y+b.Height)
	if x2 <= x1 || y2 <= y1 {
		return 0
	}
	inter := (x2 - x1) * (y2 - y1)
	union := aArea + bArea - inter
	return float64(inter) / float64(union)
}
