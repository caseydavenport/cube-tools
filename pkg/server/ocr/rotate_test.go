package ocr

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// writeTestJPEG writes a wxh image whose top half is red and bottom half white.
// A large block survives JPEG compression (a single pixel would not), so a test
// can reliably check where the red region lands after rotation.
func writeTestJPEG(t *testing.T, path string, w, h int) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		c := color.RGBA{255, 255, 255, 255}
		if y < h/2 {
			c = color.RGBA{255, 0, 0, 255}
		}
		for x := range w {
			img.Set(x, y, c)
		}
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := jpeg.Encode(f, img, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
}

func decodeJPEG(t *testing.T, path string) image.Image {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	img, err := jpeg.Decode(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	return img
}

// isRedish reports whether c reads as red. JPEG is lossy, so we test for a
// dominant red channel rather than exact equality.
func isRedish(c color.Color) bool {
	r, g, b, _ := c.RGBA()
	return r>>8 > 180 && g>>8 < 80 && b>>8 < 80
}

func TestRotateHandlerClockwise(t *testing.T) {
	root := t.TempDir()
	rel := "2026-01-17_evt_1/img/p3/deck-1.jpg"
	full := filepath.Join(root, "polyverse", rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	// 40x20 image, top half red. A clockwise turn produces a 20x40 image with
	// the red moved to the right half (the top edge rotates to the right edge).
	writeTestJPEG(t, full, 40, 20)

	h := RotateHandlerWithRoot(root)
	r := reqWithCube(t, "POST", "/api/polyverse/ocr/rotate", "polyverse")
	r.Body = bodyOf(`{"photo":"` + rel + `","direction":"cw"}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}

	out := decodeJPEG(t, full)
	if out.Bounds().Dx() != 20 || out.Bounds().Dy() != 40 {
		t.Fatalf("dims = %dx%d, want 20x40", out.Bounds().Dx(), out.Bounds().Dy())
	}
	// Right column should be red, left column white.
	if !isRedish(out.At(18, 20)) {
		t.Fatalf("right half not red after CW rotate; got %v", out.At(18, 20))
	}
	if isRedish(out.At(1, 20)) {
		t.Fatalf("left half should be white after CW rotate; got %v", out.At(1, 20))
	}
}

func TestRotateHandlerRejectsBadDir(t *testing.T) {
	h := RotateHandlerWithRoot(t.TempDir())
	r := reqWithCube(t, "POST", "/api/polyverse/ocr/rotate", "polyverse")
	r.Body = bodyOf(`{"photo":"x/y.jpg","direction":"sideways"}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestRotateHandlerRejectsTraversal(t *testing.T) {
	h := RotateHandlerWithRoot(t.TempDir())
	r := reqWithCube(t, "POST", "/api/polyverse/ocr/rotate", "polyverse")
	r.Body = bodyOf(`{"photo":"../../etc/passwd","direction":"cw"}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("status = %d, want 403", w.Code)
	}
}
