package ocr

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

// runTesseractLine OCRs imagePath and returns the text tesseract read, with
// surrounding whitespace trimmed. Returns a friendly error if the tesseract
// binary isn't on PATH.
//
// pageSegmentationMode is Tesseract's --psm flag: how it splits the image into
// text regions before reading (7 is "single text line", 6 is "one block").
func runTesseractLine(imagePath string, pageSegmentationMode int) (string, error) {
	if _, err := exec.LookPath("tesseract"); err != nil {
		return "", fmt.Errorf("tesseract binary not found on PATH (install with `apt install tesseract-ocr` or `brew install tesseract`): %w", err)
	}
	cmd := exec.Command("tesseract", imagePath, "-", "--psm", strconv.Itoa(pageSegmentationMode))

	// Pin to one thread: tesseract's OpenMP fan-out buys little on a small strip
	// and makes concurrent calls oversubscribe the CPU. We parallelize across calls.
	cmd.Env = append(os.Environ(), "OMP_THREAD_LIMIT=1")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("tesseract failed: %w: %s", err, stderr.String())
	}
	return strings.TrimSpace(stdout.String()), nil
}
