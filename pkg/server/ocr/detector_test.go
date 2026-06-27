package ocr

import (
	"testing"

	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
)

func TestToLineJSON(t *testing.T) {
	r := ocrpkg.MatchResult{
		DetectedText: "Counterspel",
		Bbox:         ocrpkg.Bbox{X: 1, Y: 2, Width: 3, Height: 4},
		Band:         ocrpkg.ConfidenceHigh,
		Candidates:   []ocrpkg.Candidate{{Name: "Counterspell", Score: 0.95}, {Name: "Counterflux", Score: 0.5}},
	}
	got := toLineJSON(r)
	if got.Band != "high" {
		t.Fatalf("band = %q, want high", got.Band)
	}
	if got.Chosen != "Counterspell" {
		t.Fatalf("chosen = %q, want Counterspell", got.Chosen)
	}
	if len(got.Candidates) != 2 {
		t.Fatalf("candidates = %d, want 2", len(got.Candidates))
	}
}

func TestToLineJSONUnmatchedHasNoChosen(t *testing.T) {
	got := toLineJSON(ocrpkg.MatchResult{Band: ocrpkg.ConfidenceUnmatched})
	if got.Chosen != "" {
		t.Fatalf("chosen = %q, want empty for unmatched", got.Chosen)
	}
}
