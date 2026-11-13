package ocr

import (
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/agnivade/levenshtein"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Confidence is the confidence band for a fuzzy match.
type Confidence int

const (
	ConfidenceUnmatched Confidence = iota

	// Tentative: below lowConfidenceThreshold, but far enough ahead of the
	// next candidate to be plausibly right. Flagged for the user to confirm.
	ConfidenceVeryLow
	ConfidenceLow
	ConfidenceHigh
)

// Thresholds for fuzzy-match score (0 = no similarity, 1 = identical).
const (
	highConfidenceThreshold = 0.90
	lowConfidenceThreshold  = 0.70

	// A 0.70-0.90 top match is promoted to high confidence when it leads the
	// runner-up by this much (a unique winner, not a near-tie), which keeps
	// sibling names like Noble Hierarch / Ignoble Hierarch low.
	highConfidenceGap = 0.20

	// Floor of the tentative band; below it is OCR noise against the ~340 cube
	// names. The gap is the lead over the runner-up needed to count.
	veryLowConfidenceThreshold = 0.55
	veryLowConfidenceGap       = 0.20
)

// Short names (below shortNameLen) only count their substring score if it
// clears shortNameSubstringMin. Otherwise they match letters mid-word in
// unrelated names ("Fell" inside "Kellan"); a real win is near 1.0.
const (
	shortNameLen          = 8
	shortNameSubstringMin = 0.95
)

// Candidate is one possible card match for a detected line.
type Candidate struct {
	Name  string  `json:"name"`
	Score float64 `json:"score"`
}

// MatchResult is the outcome of matching one OCR'd region against the cube.
type MatchResult struct {
	DetectedText string

	// Candidates holds the top-3 matches, highest score first.
	Candidates []Candidate

	Band Confidence

	// Bbox locates the OCR'd line in the source image.
	Bbox Bbox
}

// Top returns the highest-scoring candidate, or a zero Candidate if none.
func (r MatchResult) Top() Candidate {
	if len(r.Candidates) == 0 {
		return Candidate{}
	}
	return r.Candidates[0]
}

// cleanOCRText strips icon/cost noise from the OCR'd title line. Tesseract
// reads the mana symbols and set glyph as junk single-letter tokens, which
// drags short names below threshold. Keep letters, digits, and the few
// punctuation marks that appear in names, then trim single-char tokens off
// each end.
func cleanOCRText(text string) string {
	var sb strings.Builder
	for _, r := range text {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r):
			sb.WriteRune(r)
		case r == ' ', r == ',', r == '\'', r == '-':
			sb.WriteRune(r)
		default:
			sb.WriteRune(' ')
		}
	}
	tokens := strings.Fields(sb.String())
	for len(tokens) > 0 && isNoiseToken(tokens[0]) {
		tokens = tokens[1:]
	}
	for len(tokens) > 0 && isNoiseToken(tokens[len(tokens)-1]) {
		tokens = tokens[:len(tokens)-1]
	}
	return strings.Join(tokens, " ")
}

// isNoiseToken reports whether a leading/trailing token is almost certainly
// icon/cost junk: a single char, or a token with no letters at all. Kept
// conservative - real names can start or end with two-letter words ("Of One
// Mind", "By Force") - so heavier junk is left to the substring scorer.
func isNoiseToken(t string) bool {
	if utf8.RuneCountInString(t) == 1 {
		return true
	}
	for _, r := range t {
		if unicode.IsLetter(r) {
			return false
		}
	}
	return true
}

// matchLine scores text against every cube name three ways (raw, cleaned, and
// substring-window) and returns the top 3 by best-of-the-three score, with a
// confidence band from the top score. Basic lands are never matched: they're
// entered by hand through the basics control, not the cube list.
func matchLine(text string, cube *types.Cube) MatchResult {
	text = strings.TrimSpace(text)
	rawLower := strings.ToLower(text)
	cleanedLower := strings.ToLower(cleanOCRText(text))

	names := cube.Names()
	candidates := make([]Candidate, 0, len(names))
	for _, name := range names {
		candidates = append(candidates, Candidate{Name: name, Score: scoreName(rawLower, cleanedLower, name)})
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].Score > candidates[j].Score })
	promoteContainedTop(candidates)
	if len(candidates) > 3 {
		candidates = candidates[:3]
	}

	return MatchResult{
		DetectedText: text,
		Candidates:   candidates,
		Band:         confidenceBand(candidates),
	}
}

// confidenceBand picks the band for candidates sorted best first, from the top
// score and how far it leads the runner-up.
func confidenceBand(candidates []Candidate) Confidence {
	if len(candidates) == 0 {
		return ConfidenceUnmatched
	}
	top := candidates[0].Score
	runnerUp := 0.0
	if len(candidates) > 1 {
		runnerUp = candidates[1].Score
	}
	switch {
	case top >= highConfidenceThreshold:
		return ConfidenceHigh
	case top >= lowConfidenceThreshold && top-runnerUp >= highConfidenceGap:
		return ConfidenceHigh
	case top >= lowConfidenceThreshold:
		return ConfidenceLow
	case top >= veryLowConfidenceThreshold && top-runnerUp >= veryLowConfidenceGap:
		return ConfidenceVeryLow
	default:
		return ConfidenceUnmatched
	}
}

// scoreName returns how well the OCR text matches one cube name, as the best of
// three scores: whole-string similarity of the raw text, of the cleaned text,
// and the best substring window of the raw text. Split cards ("A // B") are
// also scored against each half.
func scoreName(rawLower, cleanedLower, name string) float64 {
	lowerName := strings.ToLower(name)
	targets := []string{lowerName}
	if front, back, ok := strings.Cut(lowerName, " // "); ok {
		targets = append(targets, front, back)
	}

	best := 0.0
	for _, target := range targets {
		best = max(best, similarity(rawLower, target), similarity(cleanedLower, target))
	}

	// Substring-match the full name, plus either half of a split card at least
	// shortNameLen long. The gate stops a short half like "Fire" matching any
	// "...fire..." query.
	for _, target := range targets {
		targetLen := utf8.RuneCountInString(target)
		if target != lowerName && targetLen < shortNameLen {
			continue
		}
		score := substringSimilarity(rawLower, target)
		if targetLen < shortNameLen && score < shortNameSubstringMin {
			continue
		}
		best = max(best, score)
	}
	return best
}

// containmentSwapMargin is how close a longer candidate must score to replace a
// top name it contains. The substring score favors shorter names ("Noble
// Hierarch" over "Ignoble Hierarch"), but the longer name's score is better.
const containmentSwapMargin = 0.05

// promoteContainedTop rewrites cands in place so that, if the top
// candidate's name is contained in a longer candidate's name within
// containmentSwapMargin, the longer candidate takes the front slot.
func promoteContainedTop(cands []Candidate) {
	if len(cands) < 2 {
		return
	}
	topName := strings.ToLower(cands[0].Name)
	floor := cands[0].Score - containmentSwapMargin
	for i := 1; i < len(cands); i++ {
		if cands[i].Score < floor {
			break
		}
		other := strings.ToLower(cands[i].Name)
		if len(other) > len(topName) && strings.Contains(other, topName) {
			promoted := cands[i]
			copy(cands[1:i+1], cands[:i])
			cands[0] = promoted
			return
		}
	}
}

// anchorOverlap is how much a later match's bbox must overlap an accepted
// one (as a fraction of its own area) to be suppressed as a duplicate.
const anchorOverlap = 0.5

// dedupeByAnchor greedily keeps the highest-scoring matches and suppresses any
// later match whose anchor bbox overlaps an already-accepted anchor by
// >= anchorOverlap fraction of its own area.
func dedupeByAnchor(matches []MatchResult) []MatchResult {
	sorted := make([]MatchResult, len(matches))
	copy(sorted, matches)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].Top().Score > sorted[j].Top().Score
	})
	var accepted []MatchResult
	for _, m := range sorted {
		suppressed := false
		for _, a := range accepted {
			if overlapFraction(m.Bbox, a.Bbox) >= anchorOverlap {
				suppressed = true
				break
			}
		}
		if !suppressed {
			accepted = append(accepted, m)
		}
	}
	return accepted
}

// substringSimilarity returns the best fuzzy alignment of name against any
// contiguous window of query (1 - dist/len(name)). Leading and trailing junk
// in the query is free - the usual OCR title-bar case - but edits inside the
// name cost normal Levenshtein, so "Warladder's Cull" still scores well
// against "Warleader's Call". It's the usual approximate-match DP, O(name*query).
func substringSimilarity(query, name string) float64 {
	queryRunes := []rune(query)
	nameRunes := []rune(name)
	if len(nameRunes) == 0 || len(queryRunes) == 0 {
		return 0
	}
	if len(queryRunes) < len(nameRunes) {
		return similarity(query, name)
	}

	// prev and curr are edit-distance rows: entry j costs matching the first i
	// name runes to a window ending at query rune j. Row 0 is zeros so a window
	// can start anywhere.
	prev := make([]int, len(queryRunes)+1)
	curr := make([]int, len(queryRunes)+1)
	for i := 1; i <= len(nameRunes); i++ {
		curr[0] = i
		for j := 1; j <= len(queryRunes); j++ {
			cost := 1
			if nameRunes[i-1] == queryRunes[j-1] {
				cost = 0
			}
			best := prev[j-1] + cost
			if v := prev[j] + 1; v < best {
				best = v
			}
			if v := curr[j-1] + 1; v < best {
				best = v
			}
			curr[j] = best
		}
		prev, curr = curr, prev
	}
	minDist := prev[1]
	for j := 2; j <= len(queryRunes); j++ {
		minDist = min(minDist, prev[j])
	}
	return 1 - float64(minDist)/float64(len(nameRunes))
}

// similarity returns 1 - editDistance/longerLength between a and b, counted in
// runes: 1 for identical strings, 0 for nothing in common.
func similarity(a, b string) float64 {
	if a == "" && b == "" {
		return 1
	}
	longer := max(utf8.RuneCountInString(a), utf8.RuneCountInString(b))
	if longer == 0 {
		return 0
	}
	return 1 - float64(levenshtein.ComputeDistance(a, b))/float64(longer)
}
