//go:build ocr_cv

package ocr

import (
	"image"
	"image/color"

	"gocv.io/x/gocv"
)

// Sleeve-segmentation tuning constants.
//
// We work in HSV color space (hue, saturation, value) instead of RGB. Hue is
// the color itself, kept separate from how bright or washed-out the pixel is,
// so we can pick out "orange" without lighting throwing us off. OpenCV packs
// hue into 0-179 (half the usual 0-360 degrees, so it fits in one byte).
const (
	// Low and high ends of the orange hue band. Every cube we handle uses
	// orange sleeves.
	SleeveHueLo = 5
	SleeveHueHi = 22

	// A pixel only counts as sleeve if it's at least this saturated (vivid,
	// not grey) and this bright. Drops washed-out and shadowed pixels.
	SleeveSatMin = 120
	SleeveValMin = 100

	// Kernel sizes (in pixels) for the cleanup at the end. "Close" fills small
	// holes inside the mask; "dilate" grows the mask outward a little.
	SealCloseKernel  = 5
	SealDilateKernel = 3
	SealDilateIter   = 1

	// Glossy sleeves catch glare: bright spots that wash out to near-white and
	// fall outside the orange band, punching holes in the mask. This is the
	// near-white band we treat as possible glare: high brightness (value), low
	// saturation (close to white).
	GlareValMin = 220
	GlareSatMax = 60

	// We only trust a near-white pixel as glare if it sits just above real
	// orange (glare runs along the top edge, since light comes from above).
	// GlareVicinity is how far up to look (px); GlareVicinityHalfWidth is a
	// little sideways slack.
	GlareVicinity          = 40
	GlareVicinityHalfWidth = 6
)

// BuildSleeveMask finds the orange sleeves and returns a mask: a black-and-white
// image (one byte per pixel, which OpenCV calls CV_8UC1) that's white where the
// pixel looks like sleeve and black everywhere else.
//
// It keeps the pixels in the orange band, adds back glare that washed out of
// that band, then cleans up the result with morphology (fills small holes and
// grows the shape) to seal gaps. The caller is responsible for freeing the
// returned Mat by calling Close on it.
func BuildSleeveMask(img gocv.Mat) gocv.Mat {
	hsv := gocv.NewMat()
	defer hsv.Close()
	gocv.CvtColor(img, &hsv, gocv.ColorBGRToHSV)

	// Keep pixels inside the orange band that are vivid and bright enough.
	raw := gocv.NewMat()
	defer raw.Close()
	lower := gocv.NewScalar(SleeveHueLo, SleeveSatMin, SleeveValMin, 0)
	upper := gocv.NewScalar(SleeveHueHi, 255, 255, 0)
	gocv.InRangeWithScalar(hsv, lower, upper, &raw)

	// Find every near-white pixel (bright, low saturation). On its own this
	// catches glare plus any other white in the photo; we narrow it down below
	// to just the bits sitting on or above real orange.
	highlight := gocv.NewMat()
	defer highlight.Close()
	hiLo := gocv.NewScalar(0, 0, GlareValMin, 0)
	hiHi := gocv.NewScalar(179, GlareSatMax, 255, 0)
	gocv.InRangeWithScalar(hsv, hiLo, hiHi, &highlight)

	// Grow the orange mask into a "vicinity" mask covering the strip just above
	// each sleeve pixel. The kernel (the brush shape the grow uses) is tall and
	// narrow, and we anchor it at its bottom edge so it paints upward, where
	// glare lives, not downward into card-front reflection.
	kW := 2*GlareVicinityHalfWidth + 1
	kH := GlareVicinity + 1
	vicinityKernel := gocv.GetStructuringElement(gocv.MorphRect, image.Pt(kW, kH))
	defer vicinityKernel.Close()
	vicinity := gocv.NewMat()
	defer vicinity.Close()
	gocv.DilateWithParams(raw, &vicinity, vicinityKernel,
		image.Pt(GlareVicinityHalfWidth, kH-1), 1,
		gocv.BorderConstant, color.RGBA{0, 0, 0, 0})

	// Glare is the near-white pixels that fall inside that vicinity; OR it back
	// into the orange mask.
	glare := gocv.NewMat()
	defer glare.Close()
	gocv.BitwiseAnd(highlight, vicinity, &glare)

	merged := gocv.NewMat()
	defer merged.Close()
	gocv.BitwiseOr(raw, glare, &merged)

	// Fill small holes, then grow the mask outward to seal remaining gaps.
	closeKernel := gocv.GetStructuringElement(gocv.MorphRect, image.Pt(SealCloseKernel, SealCloseKernel))
	defer closeKernel.Close()
	closed := gocv.NewMat()
	defer closed.Close()
	gocv.MorphologyEx(merged, &closed, gocv.MorphClose, closeKernel)

	dilateKernel := gocv.GetStructuringElement(gocv.MorphRect, image.Pt(SealDilateKernel, SealDilateKernel))
	defer dilateKernel.Close()

	out := gocv.NewMat()
	gocv.Dilate(closed, &out, dilateKernel)
	for i := 1; i < SealDilateIter; i++ {
		next := gocv.NewMat()
		gocv.Dilate(out, &next, dilateKernel)
		out.Close()
		out = next
	}
	return out
}
