package ocr

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

// RunTesseractLine OCRs imagePath and returns the concatenated single-line
// text output (whitespace-trimmed). Returns a friendly error if the binary
// isn't on PATH.
//
// pageSegmentationMode is Tesseract's --psm flag: how it splits the image into
// text regions before reading. We pass 7 ("single text line") for name strips.
func RunTesseractLine(imagePath string, pageSegmentationMode int) (string, error) {
	if _, err := exec.LookPath("tesseract"); err != nil {
		return "", fmt.Errorf("tesseract binary not found on PATH (install with `apt install tesseract-ocr` or `brew install tesseract`): %w", err)
	}
	cmd := exec.Command("tesseract", imagePath, "-", "--psm", strconv.Itoa(pageSegmentationMode))

	// Pin each invocation to one thread. Tesseract links OpenMP and by default
	// fans a single call out across every core, which on a small name strip
	// buys little but means concurrent calls oversubscribe the CPU and thrash.
	// We get our parallelism by running many single-threaded calls at once.
	cmd.Env = append(os.Environ(), "OMP_THREAD_LIMIT=1")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("tesseract failed: %w: %s", err, stderr.String())
	}
	return strings.TrimSpace(stdout.String()), nil
}
