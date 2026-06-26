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
	r := MatchLine("Lightning Bolt", cl)
	require.Equal(t, "Lightning Bolt", r.Top().Name)
	require.Equal(t, ConfidenceHigh, r.Band)
}

func TestMatch_TypoMatches(t *testing.T) {
	cl := miniCube()
	r := MatchLine("Lighming Bot", cl)
	require.Equal(t, "Lightning Bolt", r.Top().Name)
	// The gap to the next-best candidate (Lightning Strike) is wide here,
	// so this lands in the high band via the gap-based promotion. We just
	// require it not be unmatched.
	require.NotEqual(t, ConfidenceUnmatched, r.Band)
	require.GreaterOrEqual(t, len(r.Candidates), 1)
}

func TestMatch_AmbiguousTypoStaysLow(t *testing.T) {
	cl := miniCube()
	// "Lightming Strolt" is roughly equidistant from Lightning Bolt and
	// Lightning Strike, so the gap is small and the band stays low.
	r := MatchLine("Lightming Strolt", cl)
	require.Contains(t, []string{"Lightning Bolt", "Lightning Strike"}, r.Top().Name)
	require.Equal(t, ConfidenceLow, r.Band)
}

func TestMatch_NoMatchIsUnmatched(t *testing.T) {
	cl := miniCube()
	r := MatchLine("zzzzzzzzzzzzzzz", cl)
	require.Equal(t, ConfidenceUnmatched, r.Band)
}

func TestMatch_CaseInsensitive(t *testing.T) {
	cl := miniCube()
	r := MatchLine("lightning bolt", cl)
	require.Equal(t, "Lightning Bolt", r.Top().Name)
	require.Equal(t, ConfidenceHigh, r.Band)
}

func TestMatch_TopThree(t *testing.T) {
	cl := miniCube()
	r := MatchLine("Lightning", cl)
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
	r := MatchLine("Lim-Dûl's Vault", cl)
	require.Equal(t, "Lim-Dûl's Vault", r.Top().Name)
	require.Equal(t, ConfidenceHigh, r.Band)
	require.InDelta(t, 1.0, r.Top().Score, 0.0001)
}

func splitCardCube(t *testing.T) *types.Cube {
	t.Helper()
	return miniCube("Questing Druid // Seek the Beast")
}

func TestMatch_FullSplitNameWins(t *testing.T) {
	r := MatchLine("Questing Druid // Seek the Beast", splitCardCube(t))
	require.Equal(t, "Questing Druid // Seek the Beast", r.Top().Name)
	require.InDelta(t, 1.0, r.Top().Score, 1e-9)
}

func TestMatch_LeftSplitHalfMatches(t *testing.T) {
	r := MatchLine("Questing Druid", splitCardCube(t))
	require.GreaterOrEqual(t, r.Top().Score, HighConfidenceThreshold)
}

func TestMatch_RightSplitHalfMatches(t *testing.T) {
	r := MatchLine("Seek the Beast", splitCardCube(t))
	require.GreaterOrEqual(t, r.Top().Score, HighConfidenceThreshold)
}

func TestMatch_BasicLandRecognizedNotInCube(t *testing.T) {
	// Plains is not in this cube, but should still be recognized.
	cl := miniCube("Lightning Bolt", "Counterspell")
	r := MatchLine("Plains", cl)
	require.Equal(t, "Plains", r.Top().Name)
	require.Equal(t, ConfidenceHigh, r.Band)
}

func TestMatch_BasicLandFuzzyRead(t *testing.T) {
	cl := miniCube("Lightning Bolt", "Counterspell")
	// Noisy reads of a Forest strip with icon junk on either side.
	r := MatchLine("Be Forest DS caged Bi ft", cl)
	require.Equal(t, "Forest", r.Top().Name)
	require.Equal(t, ConfidenceHigh, r.Band)
}

func TestMatch_BasicLandIgnoredWhenCubeMatchBetter(t *testing.T) {
	// "Mountain" appears inside a real cube card name. The cube card
	// should still win on its own merits.
	cl := miniCube("Sokenzan, Crucible of Defiance", "Lightning Bolt")
	r := MatchLine("Sokenzan, Crucible of Defiance", cl)
	require.Equal(t, "Sokenzan, Crucible of Defiance", r.Top().Name)
	require.Equal(t, ConfidenceHigh, r.Band)
}

func TestMatch_ContainedNamePromotesLonger(t *testing.T) {
	cl := miniCube("Noble Hierarch", "Ignoble Hierarch")
	// OCR text that's close to both names. Substring matching gives the
	// shorter "Noble Hierarch" a slight edge by the dist/len(name) formula,
	// but the longer "Ignoble Hierarch" is the correct read.
	r := MatchLine("tgnotie Hierarch", cl)
	require.Equal(t, "Ignoble Hierarch", r.Top().Name)
}
