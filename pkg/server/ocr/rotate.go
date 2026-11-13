package ocr

import (
	"encoding/json"
	"image"
	"image/jpeg"
	"net/http"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"
)

// Rotation directions, as sent in the request and compared against below.
const (
	directionCW  = "cw"
	directionCCW = "ccw"
)

// jpegQuality is the quality a rotated photo is re-encoded at, high enough that
// card names stay readable for OCR.
const jpegQuality = 92

// rotateRequest names the photo, relative to the draft, and which way to turn it.
type rotateRequest struct {
	Photo     string `json:"photo"`
	Direction string `json:"direction"`
}

// RotateHandler rotates a draft photo 90 degrees in place. Detection,
// region-matching, and display all read the file from disk, so rotating the
// file itself keeps every view consistent without threading orientation
// through each endpoint.
func RotateHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		var req rotateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		if req.Direction != directionCW && req.Direction != directionCCW {
			http.Error(rw, "Invalid direction", http.StatusBadRequest)
			return
		}
		abs, ok := draft.PhotoPath(req.Photo)
		if !ok {
			logrus.WithFields(logrus.Fields{"draft": draft.ID, "path": req.Photo}).Warn("Blocked invalid rotate path")
			http.Error(rw, "Invalid path", http.StatusForbidden)
			return
		}
		if err := rotateJPEGFile(abs, req.Direction == directionCW); err != nil {
			logrus.WithError(err).WithField("photo", req.Photo).Warn("Rotate failed")
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		rw.WriteHeader(http.StatusOK)
	})
}

// rotateJPEGFile rotates a JPEG on disk 90 degrees and rewrites it. Re-encoding
// drops any EXIF orientation tag, so the stored pixels are what both the
// browser and the detector see (no silent EXIF rotation to disagree about).
// Writes to a temp file then renames, so a failure can't leave a half-written
// photo behind.
func rotateJPEGFile(path string, cw bool) error {
	src, err := decodeJPEGFile(path)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".rotate-*.jpg")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if err := jpeg.Encode(tmp, rotate90(src, cw), &jpeg.Options{Quality: jpegQuality}); err != nil {
		closeAndLog(tmp, tmpName)
		removeAndLog(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		removeAndLog(tmpName)
		return err
	}
	return os.Rename(tmpName, path)
}

// decodeJPEGFile reads and decodes the JPEG at path.
func decodeJPEGFile(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer closeAndLog(f, path)
	return jpeg.Decode(f)
}

// rotate90 turns src 90 degrees, clockwise when cw is true.
func rotate90(src image.Image, cw bool) image.Image {
	bounds := src.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, height, width))
	for y := range height {
		for x := range width {
			pixel := src.At(bounds.Min.X+x, bounds.Min.Y+y)

			// The top row becomes the right column when turning clockwise and
			// the left column when turning counterclockwise.
			if cw {
				dst.Set(height-1-y, x, pixel)
			} else {
				dst.Set(y, width-1-x, pixel)
			}
		}
	}
	return dst
}
