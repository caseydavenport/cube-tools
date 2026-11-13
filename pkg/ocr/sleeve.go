//go:build ocr_cv

package ocr

import (
	"image"
	"image/color"

	"gocv.io/x/gocv"
)

// Sleeve segmentation works in HSV (hue, saturation, value), not RGB, because
// hue is the color itself and lighting barely moves it. OpenCV packs hue into
// 0-179 (half of 0-360). The per-cube band is in SleevePalette.
const (
	// Kernel sizes (in pixels) for the cleanup at the end. "Close" fills small
	// holes inside the mask; "dilate" grows the mask outward a little.
	sealCloseKernel  = 5
	sealDilateKernel = 3

	// Glossy sleeves catch glare: bright spots that wash out to near-white and
	// fall outside the hue band, punching holes in the mask. This is the
	// near-white band treated as possible glare: bright and barely saturated.
	glareValMin = 220
	glareSatMax = 60

	// A near-white pixel only counts as glare if it sits just above real sleeve,
	// since light comes from above. glareVicinity is how far up to look (px);
	// glareVicinityHalfWidth is a little sideways slack.
	glareVicinity          = 40
	glareVicinityHalfWidth = 6
)

// buildSleeveMask finds the sleeves in the palette's color and returns a mask:
// a black-and-white image (one byte per pixel, which OpenCV calls CV_8UC1)
// that's white where the pixel looks like sleeve and black everywhere else.
// Glare that washed out of the hue band is added back, then morphology (fill
// small holes, grow the shape) seals gaps. The caller must Close the Mat.
func buildSleeveMask(img gocv.Mat, pal SleevePalette) gocv.Mat {
	hsv := gocv.NewMat()
	defer hsv.Close()
	gocv.CvtColor(img, &hsv, gocv.ColorBGRToHSV)

	// Keep pixels inside the sleeve's hue band that are vivid and bright enough.
	raw := gocv.NewMat()
	defer raw.Close()
	lower := gocv.NewScalar(float64(pal.HueLo), float64(pal.SatMin), float64(pal.ValMin), 0)
	upper := gocv.NewScalar(float64(pal.HueHi), 255, 255, 0)
	gocv.InRangeWithScalar(hsv, lower, upper, &raw)

	// Find every near-white pixel (bright, low saturation). On its own this
	// catches glare plus any other white in the photo; we narrow it down below
	// to just the bits sitting on or above real sleeve.
	highlight := gocv.NewMat()
	defer highlight.Close()
	highlightLower := gocv.NewScalar(0, 0, glareValMin, 0)
	highlightUpper := gocv.NewScalar(179, glareSatMax, 255, 0)
	gocv.InRangeWithScalar(hsv, highlightLower, highlightUpper, &highlight)

	// Grow the sleeve mask into a "vicinity" mask: the strip just above each
	// sleeve pixel. The kernel (the brush shape) is tall and narrow, anchored at
	// its bottom so it paints upward, where glare lives.
	kernelWidth := 2*glareVicinityHalfWidth + 1
	kernelHeight := glareVicinity + 1
	vicinityKernel := gocv.GetStructuringElement(gocv.MorphRect, image.Pt(kernelWidth, kernelHeight))
	defer vicinityKernel.Close()
	vicinity := gocv.NewMat()
	defer vicinity.Close()
	gocv.DilateWithParams(raw, &vicinity, vicinityKernel, image.Pt(glareVicinityHalfWidth, kernelHeight-1), 1, gocv.BorderConstant, color.RGBA{0, 0, 0, 0})

	// Glare is the near-white pixels that fall inside that vicinity; OR it back
	// into the sleeve mask.
	glare := gocv.NewMat()
	defer glare.Close()
	gocv.BitwiseAnd(highlight, vicinity, &glare)

	merged := gocv.NewMat()
	defer merged.Close()
	gocv.BitwiseOr(raw, glare, &merged)

	// Fill small holes, then grow the mask outward to seal remaining gaps.
	closeKernel := gocv.GetStructuringElement(gocv.MorphRect, image.Pt(sealCloseKernel, sealCloseKernel))
	defer closeKernel.Close()
	closed := gocv.NewMat()
	defer closed.Close()
	gocv.MorphologyEx(merged, &closed, gocv.MorphClose, closeKernel)

	dilateKernel := gocv.GetStructuringElement(gocv.MorphRect, image.Pt(sealDilateKernel, sealDilateKernel))
	defer dilateKernel.Close()
	out := gocv.NewMat()
	gocv.Dilate(closed, &out, dilateKernel)
	return out
}
