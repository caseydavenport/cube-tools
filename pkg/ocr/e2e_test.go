//go:build ocr_cv && ocr_e2e

package ocr

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// TestRecallAgainstRealPhotos walks every photo in the p1p1 2026 draft
// directories under data/polyverse and asserts the pipeline's recall against
// the hand-transcribed mainboard/sideboard/pool for each player stays above a
// per-photo floor. Floors are observed runs rounded down, acting as a
// regression guard, not a quality bar - ratchet them upward as the pipeline
// improves. Build with `-tags 'ocr_cv ocr_e2e'`; it stays out of normal CI.
func TestRecallAgainstRealPhotos(t *testing.T) {
	if _, err := exec.LookPath("tesseract"); err != nil {
		t.Skip("tesseract not on PATH")
	}
	if os.Getenv("OCR_DEBUG_LOG") != "" {
		logrus.SetLevel(logrus.DebugLevel)
	}

	// Per-photo recall floors, keyed by "<draftdir>/<player>/<filename>".
	// Observed runs rounded down to the nearest 0.05, a regression guard rather
	// than a quality bar - low floors flag the photos worth improving next.
	minRecall := map[string]float64{
		"2026-01-17_p1p12026_1/p1/checkin-1.jpg":  0.65,
		"2026-01-17_p1p12026_1/p1/checkout-1.jpg": 0.70,
		"2026-01-17_p1p12026_1/p1/deck-1.jpg":     0.20,
		"2026-01-17_p1p12026_1/p2/checkin-1.jpg":  0.40,
		"2026-01-17_p1p12026_1/p2/checkout-1.jpg": 0.45,
		"2026-01-17_p1p12026_1/p2/deck-1.jpg":     0.30,
		"2026-01-17_p1p12026_1/p3/checkin-1.jpg":  0.65,
		"2026-01-17_p1p12026_1/p3/checkout-1.jpg": 0.60,
		"2026-01-17_p1p12026_1/p3/deck-1.jpg":     0.30,
		"2026-01-17_p1p12026_1/p4/checkin-1.jpg":  0.65,
		"2026-01-17_p1p12026_1/p4/checkout-1.jpg": 0.60,
		"2026-01-17_p1p12026_1/p4/deck-1.jpg":     0.50,
		"2026-01-17_p1p12026_1/p5/checkin-1.jpg":  0.55,
		"2026-01-17_p1p12026_1/p5/checkout-1.jpg": 0.45,
		"2026-01-17_p1p12026_1/p5/deck-1.jpg":     0.50,
		"2026-01-17_p1p12026_1/p6/checkin-1.jpg":  0.55,
		"2026-01-17_p1p12026_1/p6/checkout-1.jpg": 0.30,
		"2026-01-17_p1p12026_1/p7/checkin-1.jpg":  0.70,
		"2026-01-17_p1p12026_1/p7/checkout-1.jpg": 0.50,
		"2026-01-17_p1p12026_1/p7/deck-1.jpg":     0.70,
		"2026-01-18_p1p12026_1/p1/checkin-1.jpg":  0.55,
		"2026-01-18_p1p12026_1/p1/checkout-1.jpg": 0.55,
		"2026-01-18_p1p12026_1/p1/deck-1.jpg":     0.45,
		"2026-01-18_p1p12026_1/p2/checkin-1.jpg":  0.70,
		"2026-01-18_p1p12026_1/p2/checkout-1.jpg": 0.70,
		"2026-01-18_p1p12026_1/p2/deck-1.jpg":     0.55,
		"2026-01-18_p1p12026_1/p3/checkin-1.jpg":  0.55,
		"2026-01-18_p1p12026_1/p3/checkout-1.jpg": 0.40,
		"2026-01-18_p1p12026_1/p3/deck-1.jpg":     0.40,
		"2026-01-18_p1p12026_1/p4/checkin-1.jpg":  0.75,
		"2026-01-18_p1p12026_1/p4/checkout-1.jpg": 0.75,
		"2026-01-18_p1p12026_1/p4/deck-1.jpg":     0.40,
		"2026-01-18_p1p12026_1/p5/checkin-1.jpg":  0.80,
		"2026-01-18_p1p12026_1/p5/checkout-1.jpg": 0.70,
		"2026-01-18_p1p12026_1/p5/deck-1.jpg":     0.40,
		"2026-01-18_p1p12026_1/p6/checkin-1.jpg":  0.10,
		"2026-01-18_p1p12026_1/p6/checkout-1.jpg": 0.65,
		"2026-01-18_p1p12026_1/p7/checkin-1.jpg":  0.75,
		"2026-01-18_p1p12026_1/p7/checkout-1.jpg": 0.55,
		"2026-01-18_p1p12026_1/p7/deck-1.jpg":     0.85,
		"2026-01-18_p1p12026_1/p8/checkin-1.jpg":  0.65,
		"2026-01-18_p1p12026_1/p8/checkout-1.jpg": 0.60,
		"2026-01-18_p1p12026_1/p8/deck-1.jpg":     0.35,
	}

	dataRoot, err := filepath.Abs(filepath.Join("..", "..", "data"))
	require.NoError(t, err)

	draftDirs, err := filepath.Glob(filepath.Join(dataRoot, "polyverse", "*_p1p12026_*"))
	require.NoError(t, err)
	require.NotEmpty(t, draftDirs, "no p1p1 draft dirs found under %s/polyverse", dataRoot)

	type photo struct {
		key      string // <draftdir>/<player>/<filename>
		path     string
		cube     *types.Cube
		expected []string
	}
	var photos []photo

	for _, draftDir := range draftDirs {
		draft := filepath.Base(draftDir)
		imgRoot := filepath.Join(draftDir, "img")
		if _, err := os.Stat(imgRoot); err != nil {
			continue
		}

		cube, err := types.LoadCubeList(types.LoadOptions{
			DataRoot: dataRoot,
			Cube:     "polyverse",
			Date:     draft,
		})
		require.NoErrorf(t, err, "load cube for %s", draft)
		require.NotEmptyf(t, cube.Names(), "empty cube for %s", draft)

		playerDirs, err := os.ReadDir(imgRoot)
		require.NoError(t, err)
		for _, p := range playerDirs {
			if !p.IsDir() {
				continue
			}
			player := p.Name()
			jsonPath := filepath.Join(draftDir, fmt.Sprintf("%s-%s.json", draft, player))
			expected, err := loadExpectedCards(jsonPath)
			if err != nil {
				t.Fatalf("load expected cards for %s/%s: %v", draft, player, err)
			}
			if len(expected) == 0 {
				continue
			}

			entries, err := os.ReadDir(filepath.Join(imgRoot, player))
			require.NoError(t, err)
			for _, e := range entries {
				if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".jpg") {
					continue
				}
				photos = append(photos, photo{
					key:      filepath.Join(draft, player, e.Name()),
					path:     filepath.Join(imgRoot, player, e.Name()),
					cube:     cube,
					expected: expected,
				})
			}
		}
	}

	require.NotEmpty(t, photos, "no p1p1 photos found")

	sort.Slice(photos, func(i, j int) bool { return photos[i].key < photos[j].key })

	for _, p := range photos {
		p := p
		t.Run(p.key, func(t *testing.T) {
			results, err := DetectAndMatch(p.path, p.cube, DetectOptions{})
			require.NoError(t, err)

			// Count any non-unmatched band as a hit; recall is what we care about here.
			detected := map[string]bool{}
			for _, r := range results {
				if r.Band == ConfidenceHigh || r.Band == ConfidenceLow || r.Band == ConfidenceVeryLow {
					detected[strings.ToLower(r.Top().Name)] = true
				}
			}

			found := 0
			missing := []string{}
			for _, name := range p.expected {
				if detected[strings.ToLower(name)] {
					found++
				} else {
					missing = append(missing, name)
				}
			}
			recall := float64(found) / float64(len(p.expected))
			t.Logf("recall=%.2f (%d/%d), missing=%v", recall, found, len(p.expected), missing)

			floor := minRecall[p.key]
			require.GreaterOrEqualf(t, recall, floor,
				"recall too low: %.2f (found %d/%d)", recall, found, len(p.expected))
		})
	}
}

// loadExpectedCards reads a player JSON and returns the union of mainboard,
// sideboard, and pool card names. The fields are mutually exclusive in practice
// (a record describes either a built deck or a raw pool), so the union is the
// player's full card set for the event.
func loadExpectedCards(path string) ([]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var doc struct {
		Mainboard []string `json:"mainboard"`
		Sideboard []string `json:"sideboard"`
		Pool      []string `json:"pool"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	out := []string{}
	for _, group := range [][]string{doc.Mainboard, doc.Sideboard, doc.Pool} {
		for _, name := range group {
			key := strings.ToLower(name)
			if seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, name)
		}
	}
	return out, nil
}
