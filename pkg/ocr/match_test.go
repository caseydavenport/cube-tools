package ocr

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func miniCube(names ...string) *types.Cube {
	if len(names) == 0 {
		names = []string{
			"Lightning Bolt",
			"Lightning Strike",
			"Counterspell",
			"Brainstorm",
			"Sol Ring",
			"Sokenzan, Crucible of Defiance",
		}
	}
	c := &types.Cube{}
	for _, name := range names {
		c.Cards = append(c.Cards, types.Card{Name: name})
	}
	return c
}

func TestMatch_ExactIsHighConfidence(t *testing.T) {
	cl := miniCube()
	r := matchLine("Lightning Bolt", cl)
	require.Equal(t, "Lightning Bolt", r.Top().Name)
	require.Equal(t, ConfidenceHigh, r.Band)
}

func TestMatch_TypoMatches(t *testing.T) {
	cl := miniCube()
	r := matchLine("Lighming Bot", cl)
	require.Equal(t, "Lightning Bolt", r.Top().Name)

	// The gap to the next-best candidate (Lightning Strike) is wide here, so
	// this lands in the high band via the gap-based promotion.
	require.Equal(t, ConfidenceHigh, r.Band)
	require.GreaterOrEqual(t, len(r.Candidates), 1)
}

func TestMatch_AmbiguousTypoStaysLow(t *testing.T) {
	cl := miniCube()

	// "Lightming Strolt" is roughly equidistant from Lightning Bolt and
	// Lightning Strike, so the gap is small and the band stays low.
	r := matchLine("Lightming Strolt", cl)
	require.Contains(t, []string{"Lightning Bolt", "Lightning Strike"}, r.Top().Name)
	require.Equal(t, ConfidenceLow, r.Band)
}

func TestMatch_NoMatchIsUnmatched(t *testing.T) {
	cl := miniCube()
	r := matchLine("zzzzzzzzzzzzzzz", cl)
	require.Equal(t, ConfidenceUnmatched, r.Band)
}

func TestMatch_CaseInsensitive(t *testing.T) {
	cl := miniCube()
	r := matchLine("lightning bolt", cl)
	require.Equal(t, "Lightning Bolt", r.Top().Name)
	require.Equal(t, ConfidenceHigh, r.Band)
}

func TestMatch_TopThree(t *testing.T) {
	cl := miniCube()
	r := matchLine("Lightning", cl)
	require.LessOrEqual(t, len(r.Candidates), 3)
	require.GreaterOrEqual(t, len(r.Candidates), 2)
	names := map[string]bool{}
	for _, c := range r.Candidates {
		names[c.Name] = true
	}
	require.True(t, names["Lightning Bolt"])
	require.True(t, names["Lightning Strike"])
}

func TestMatch_ExactNonASCIIIsHighConfidence(t *testing.T) {
	cl := miniCube("Lim-Dûl's Vault")
	r := matchLine("Lim-Dûl's Vault", cl)
	require.Equal(t, "Lim-Dûl's Vault", r.Top().Name)
	require.Equal(t, ConfidenceHigh, r.Band)
	require.InDelta(t, 1.0, r.Top().Score, 0.0001)
}

func splitCardCube(t *testing.T) *types.Cube {
	t.Helper()
	return miniCube("Questing Druid // Seek the Beast")
}

func TestMatch_FullSplitNameWins(t *testing.T) {
	r := matchLine("Questing Druid // Seek the Beast", splitCardCube(t))
	require.Equal(t, "Questing Druid // Seek the Beast", r.Top().Name)
	require.InDelta(t, 1.0, r.Top().Score, 1e-9)
}

func TestMatch_LeftSplitHalfMatches(t *testing.T) {
	r := matchLine("Questing Druid", splitCardCube(t))
	require.GreaterOrEqual(t, r.Top().Score, highConfidenceThreshold)
}

func TestMatch_RightSplitHalfMatches(t *testing.T) {
	r := matchLine("Seek the Beast", splitCardCube(t))
	require.GreaterOrEqual(t, r.Top().Score, highConfidenceThreshold)
}

func TestMatch_BasicLandNotDetected(t *testing.T) {
	// Basics are entered by hand, not matched, so an exact basic-land name
	// never wins and never lands in the high band.
	cl := miniCube("Lightning Bolt", "Counterspell")
	r := matchLine("Plains", cl)
	require.NotEqual(t, "Plains", r.Top().Name)
	require.NotEqual(t, ConfidenceHigh, r.Band)
}

func TestMatch_BasicLandFuzzyNotDetected(t *testing.T) {
	cl := miniCube("Lightning Bolt", "Counterspell")

	// A noisy Forest strip must not match, since basics are never matched.
	r := matchLine("Be Forest DS caged Bi ft", cl)
	require.NotEqual(t, "Forest", r.Top().Name)
}

func TestMatch_ContainedNamePromotesLonger(t *testing.T) {
	cl := miniCube("Noble Hierarch", "Ignoble Hierarch")

	// OCR text that's close to both names. Substring matching gives the
	// shorter "Noble Hierarch" a slight edge by the dist/len(name) formula,
	// but the longer "Ignoble Hierarch" is the correct read.
	r := matchLine("tgnotie Hierarch", cl)
	require.Equal(t, "Ignoble Hierarch", r.Top().Name)
}

func TestMatch_ExactShorterNameStaysTop(t *testing.T) {
	cl := miniCube("Noble Hierarch", "Ignoble Hierarch")
	r := matchLine("Noble Hierarch", cl)
	require.Equal(t, "Noble Hierarch", r.Top().Name)
}

func TestMatch_ShortSplitHalfDoesNotMatch(t *testing.T) {
	cl := miniCube("Fire // Ice")

	// "Fire" appears verbatim in the query, but a half under shortNameLen
	// can't win on substring alone.
	r := matchLine("Campfire Stories", cl)
	require.Equal(t, ConfidenceUnmatched, r.Band)
}

func TestMatch_ShortNameNeedsNearExactSubstring(t *testing.T) {
	cl := miniCube("Fell")

	r := matchLine("Fell", cl)
	require.Equal(t, ConfidenceHigh, r.Band)

	// "Kell" is one edit from "Fell" inside the longer text, which the
	// short-name gate rejects.
	r = matchLine("Kellan the Fae-Blooded", cl)
	require.Equal(t, ConfidenceUnmatched, r.Band)
}

type cleanOCRTextCase struct {
	name string
	text string
	want string
}

func TestCleanOCRText(t *testing.T) {
	tests := []cleanOCRTextCase{
		{name: "icon junk trimmed from both ends", text: "Q Lightning Bolt R", want: "Lightning Bolt"},
		{name: "symbols become spaces", text: "Sol|Ring", want: "Sol Ring"},
		{name: "punctuation in names kept", text: "Sokenzan, Crucible-of Defiance", want: "Sokenzan, Crucible-of Defiance"},
		{name: "two-letter words at the ends kept", text: "Of One Mind", want: "Of One Mind"},
		{name: "number-only tokens trimmed", text: "42 Brainstorm 7", want: "Brainstorm"},
		{name: "only junk", text: "@ # $", want: ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, cleanOCRText(tc.text))
		})
	}
}

func TestDedupeByAnchor(t *testing.T) {
	freddie := MatchResult{DetectedText: "freddie", Bbox: Bbox{X: 0, Y: 0, Width: 100, Height: 20}, Candidates: []Candidate{{Name: "Freddie", Score: 0.95}}}
	ozzy := MatchResult{DetectedText: "ozzy", Bbox: Bbox{X: 10, Y: 0, Width: 100, Height: 20}, Candidates: []Candidate{{Name: "Ozzy", Score: 0.80}}}
	stevie := MatchResult{DetectedText: "stevie", Bbox: Bbox{X: 0, Y: 200, Width: 100, Height: 20}, Candidates: []Candidate{{Name: "Stevie", Score: 0.70}}}

	got := dedupeByAnchor([]MatchResult{ozzy, stevie, freddie})
	require.Equal(t, []MatchResult{freddie, stevie}, got, "the lower-scoring overlap is dropped and the distant box kept")

	got = dedupeByAnchor([]MatchResult{ozzy, stevie})
	require.Equal(t, []MatchResult{ozzy, stevie}, got, "without the higher-scoring box nothing is suppressed")
}

func TestPromoteContainedTop_IgnoresLongerNameBeyondMargin(t *testing.T) {
	candidates := []Candidate{{Name: "Noble Hierarch", Score: 0.90}, {Name: "Ignoble Hierarch", Score: 0.60}}
	promoteContainedTop(candidates)
	require.Equal(t, "Noble Hierarch", candidates[0].Name)

	candidates[1].Score = 0.88
	promoteContainedTop(candidates)
	require.Equal(t, "Ignoble Hierarch", candidates[0].Name)
}
