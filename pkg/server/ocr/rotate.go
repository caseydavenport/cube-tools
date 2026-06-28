package ocr

import (
	"encoding/json"
	"image"
	"image/jpeg"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/sirupsen/logrus"
)

// Rotation directions, as sent in the request and compared against below.
const (
	directionCW  = "cw"
	directionCCW = "ccw"
)

type rotateRequest struct {
	Photo     string `json:"photo"`
	Direction string `json:"direction"`
}

func RotateHandler() http.Handler { return RotateHandlerWithRoot("data") }

// RotateHandlerWithRoot rotates a draft photo 90 degrees in place. Detection,
// region-matching, and display all read the file from disk, so rotating the
// file itself keeps every view consistent without threading orientation
// through each endpoint.
func RotateHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		var req rotateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		if req.Direction != directionCW && req.Direction != directionCCW {
			http.Error(rw, "Invalid direction", http.StatusBadRequest)
			return
		}
		abs, ok := safePhotoPath(dataRoot, cube, req.Photo)
		if !ok {
			logrus.WithFields(logrus.Fields{"cube": cube, "path": req.Photo}).Warn("Blocked invalid rotate path")
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

// safePhotoPath validates that rel stays within data/<cube> and returns the
// absolute on-disk path.
func safePhotoPath(dataRoot, cube, rel string) (string, bool) {
	if cube == "" || rel == "" || strings.Contains(rel, "..") {
		return "", false
	}
	abs := filepath.Clean(filepath.Join(dataRoot, cube, rel))
	prefix := filepath.Clean(filepath.Join(dataRoot, cube)) + string(filepath.Separator)
	if !strings.HasPrefix(abs, prefix) {
		return "", false
	}
	return abs, true
}

// rotateJPEGFile rotates a JPEG on disk 90 degrees and rewrites it. Re-encoding
// drops any EXIF orientation tag, so the stored pixels are what both the
// browser and the detector see (no silent EXIF rotation to disagree about).
// Writes to a temp file then renames, so a failure can't leave a half-written
// photo behind.
func rotateJPEGFile(path string, cw bool) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	src, err := jpeg.Decode(f)
	f.Close()
	if err != nil {
		return err
	}
	rotated := rotate90(src, cw)

	tmp, err := os.CreateTemp(filepath.Dir(path), ".rotate-*.jpg")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if err := jpeg.Encode(tmp, rotated, &jpeg.Options{Quality: 92}); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	return os.Rename(tmpName, path)
}

// rotate90 turns src 90 degrees, clockwise when cw is true.
func rotate90(src image.Image, cw bool) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, h, w))
	for y := range h {
		for x := range w {
			c := src.At(b.Min.X+x, b.Min.Y+y)
			if cw {
				dst.Set(h-1-y, x, c)
			} else {
				dst.Set(y, w-1-x, c)
			}
		}
	}
	return dst
}
