//go:build ocr_cv && ocr_e2e

package ocr

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// TestGoodbyeSFRecall measures per-player recall against the goodbyesf deck
// photos - clean, unangled shots that are close to what most future photos will
// look like, so this is the case worth protecting. Only p1 is transcribed so far;
// players with an empty transcription are skipped. Build with
// `-tags 'ocr_cv ocr_e2e'`.
func TestGoodbyeSFRecall(t *testing.T) {
	// Per-player recall floors, same regression-guard idea as the e2e suite. The
	// goal for these photos is >60% recall; the floor sits a little above that.
	floors := map[string]float64{
		"p1": 0.65,
	}

	draft := "2026-07-26_goodbyesf_1"
	dataRoot, err := filepath.Abs(filepath.Join("..", "..", "data"))
	require.NoError(t, err)

	cube, err := types.LoadCubeList(types.LoadOptions{
		DataRoot: dataRoot,
		Cube:     "polyverse",
		Date:     "2026-06-20_bcp26_1",
	})
	require.NoError(t, err)
	inCube := map[string]bool{}
	for _, n := range cube.Names() {
		inCube[strings.ToLower(n)] = true
	}

	draftDir := filepath.Join(dataRoot, "polyverse", draft)
	players := []string{"p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"}

	totalFound, totalExpected := 0, 0
	for _, player := range players {
		jsonPath := filepath.Join(draftDir, fmt.Sprintf("%s-%s.json", draft, player))
		expected, err := loadExpectedCards(jsonPath)
		require.NoError(t, err)
		if len(expected) == 0 {
			// Not transcribed yet - nothing to measure against.
			continue
		}
		imgPath := filepath.Join(draftDir, "img", player, "deck-1.jpg")

		results, err := DetectAndMatch(imgPath, cube, DetectOptions{})
		require.NoError(t, err)

		detected := map[string]bool{}
		for _, r := range results {
			if r.Band == ConfidenceHigh || r.Band == ConfidenceLow || r.Band == ConfidenceVeryLow {
				detected[strings.ToLower(r.Top().Name)] = true
			}
		}
		found, inCubeCount := 0, 0
		for _, name := range expected {
			if inCube[strings.ToLower(name)] {
				inCubeCount++
			}
			if detected[strings.ToLower(name)] {
				found++
			}
		}
		totalFound += found
		totalExpected += len(expected)
		recall := float64(found) / float64(len(expected))
		fmt.Printf("GBSF %s: recall=%.2f (%d/%d), inCube=%d/%d\n",
			player, recall, found, len(expected), inCubeCount, len(expected))
		if floor, ok := floors[player]; ok {
			require.GreaterOrEqualf(t, recall, floor, "goodbyesf %s recall %.2f below floor %.2f", player, recall, floor)
		}
	}
	fmt.Printf("GBSF TOTAL: recall=%.2f (%d/%d)\n", float64(totalFound)/float64(totalExpected), totalFound, totalExpected)
}
