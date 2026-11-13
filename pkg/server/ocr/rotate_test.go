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

	"github.com/caseydavenport/cube-tools/pkg/types"
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
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	writeFile(t, path, buf.String())
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

// rotateTestPhoto rotates a 40x20 photo, red on its top half, through the
// handler and returns the 20x40 result.
func rotateTestPhoto(t *testing.T, direction string) image.Image {
	t.Helper()
	root := t.TempDir()
	draft := newDraft(t, root, types.DraftMetadata{})
	rel := "img/p3/deck-1.jpg"
	full := filepath.Join(draft.Dir, rel)
	writeTestJPEG(t, full, 40, 20)

	r := draftReq(t, "POST", "/rotate", draft)
	r.Body = bodyOf(`{"photo":"` + rel + `","direction":"` + direction + `"}`)
	w := httptest.NewRecorder()
	RotateHandler(root).ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}

	out := decodeJPEG(t, full)
	if out.Bounds().Dx() != 20 || out.Bounds().Dy() != 40 {
		t.Fatalf("dims = %dx%d, want 20x40", out.Bounds().Dx(), out.Bounds().Dy())
	}
	return out
}

func TestRotateHandlerClockwise(t *testing.T) {
	out := rotateTestPhoto(t, "cw")

	// The top edge rotates to the right edge.
	if !isRedish(out.At(18, 20)) {
		t.Fatalf("right half not red after CW rotate; got %v", out.At(18, 20))
	}
	if isRedish(out.At(1, 20)) {
		t.Fatalf("left half should be white after CW rotate; got %v", out.At(1, 20))
	}
}

func TestRotateHandlerCounterclockwise(t *testing.T) {
	out := rotateTestPhoto(t, "ccw")

	// The top edge rotates to the left edge.
	if !isRedish(out.At(1, 20)) {
		t.Fatalf("left half not red after CCW rotate; got %v", out.At(1, 20))
	}
	if isRedish(out.At(18, 20)) {
		t.Fatalf("right half should be white after CCW rotate; got %v", out.At(18, 20))
	}
}

func TestRotateHandlerLeavesUndecodablePhotoAlone(t *testing.T) {
	root := t.TempDir()
	draft := newDraft(t, root, types.DraftMetadata{})
	rel := "img/p3/deck-1.jpg"
	full := filepath.Join(draft.Dir, rel)
	writeFile(t, full, "not a jpeg")

	r := draftReq(t, "POST", "/rotate", draft)
	r.Body = bodyOf(`{"photo":"` + rel + `","direction":"cw"}`)
	w := httptest.NewRecorder()
	RotateHandler(root).ServeHTTP(w, r)
	if w.Code != 500 {
		t.Fatalf("status = %d, want 500", w.Code)
	}

	got, err := os.ReadFile(full)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "not a jpeg" {
		t.Fatalf("photo was rewritten: %q", got)
	}
	leftovers, err := filepath.Glob(filepath.Join(filepath.Dir(full), ".rotate-*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(leftovers) != 0 {
		t.Fatalf("temp files left behind: %v", leftovers)
	}
}

func TestRotateHandlerRejectsBadDir(t *testing.T) {
	root := t.TempDir()
	h := RotateHandler(root)
	r := draftReq(t, "POST", "/rotate", newDraft(t, root, types.DraftMetadata{}))
	r.Body = bodyOf(`{"photo":"x/y.jpg","direction":"sideways"}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestRotateHandlerRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	h := RotateHandler(root)
	r := draftReq(t, "POST", "/rotate", newDraft(t, root, types.DraftMetadata{}))
	r.Body = bodyOf(`{"photo":"../../etc/passwd","direction":"cw"}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("status = %d, want 403", w.Code)
	}
}
