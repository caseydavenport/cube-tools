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

	// Tentative: below LowConfidenceThreshold, but far enough ahead of the
	// next candidate to be plausibly right. Flagged for the user to confirm.
	ConfidenceVeryLow
	ConfidenceLow
	ConfidenceHigh
)

// Thresholds for fuzzy-match score (0 = no similarity, 1 = identical).
const (
	HighConfidenceThreshold = 0.90
	LowConfidenceThreshold  = 0.70

	// Promote a 0.70-0.90 top match to high confidence when it leads the
	// runner-up by this much - a unique winner, not a near-tie. Keeps sibling
	// names like Noble Hierarch / Ignoble Hierarch in the low band.
	HighConfidenceGap = 0.20

	// Floor for the tentative band; below this is just OCR noise against the
	// ~340 cube names. VeryLowConfidenceGap is the lead over the runner-up it
	// takes to count - tight enough that the top has to be a clear winner.
	VeryLowConfidenceThreshold = 0.55
	VeryLowConfidenceGap       = 0.20
)

// Basic lands (types.BasicLandNames) are always recognized even when the cube
// list doesn't contain them - they show up in every deck photo. They get a
// looser threshold (BasicLandThreshold) and skip the short-name substring gate.

// BasicLandThreshold is the minimum score for a basic land to count as high
// confidence. Looser than HighConfidenceThreshold because basics are often
// shot at low res and OCR mangles them.
const BasicLandThreshold = 0.75

// Short names (below ShortNameLen) only count their substring score if it
// clears ShortNameSubstringMin. They otherwise match letters mid-word in
// unrelated names ("Fell" inside "Kellan"); a real win comes in near 1.0
// (the name is its own OCR token), so the strict floor keeps wins and drops
// the accidents.
const (
	ShortNameLen          = 8
	ShortNameSubstringMin = 0.95
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

// MatchLine scores text against every cube name three ways (raw, cleaned,
// and substring-window) and returns the top-3 by best-of-the-three score,
// with a confidence band from the top score.
func MatchLine(text string, cube *types.Cube) MatchResult {
	text = strings.TrimSpace(text)
	cleaned := cleanOCRText(text)
	rawLower := strings.ToLower(text)
	cleanedLower := strings.ToLower(cleaned)

	cands := make([]Candidate, 0, len(cube.Names())+len(types.BasicLandNames))
	scoreName := func(name string, applyShortGate bool) float64 {
		lowerName := strings.ToLower(name)
		targets := []string{lowerName}
		if i := strings.Index(lowerName, " // "); i >= 0 {
			targets = append(targets, lowerName[:i], lowerName[i+len(" // "):])
		}
		var sRaw, sClean, sSub float64
		for _, t := range targets {
			if s := similarity(rawLower, t); s > sRaw {
				sRaw = s
			}
			if s := similarity(cleanedLower, t); s > sClean {
				sClean = s
			}
		}

		// Substring-match the full name, plus either half of a split card
		// long enough to stand alone (ShortNameLen). The gate stops a short
		// half like "Fire" matching any "...fire..." query; a long half like
		// "Kellan, the Fae-Blooded" still scores when OCR caught one face.
		for _, t := range targets {
			tLen := utf8.RuneCountInString(t)
			if t != lowerName && tLen < ShortNameLen {
				continue
			}
			s := substringSimilarity(rawLower, t)
			if applyShortGate && tLen < ShortNameLen && s < ShortNameSubstringMin {
				continue
			}
			if s > sSub {
				sSub = s
			}
		}
		best := sRaw
		if sClean > best {
			best = sClean
		}
		if sSub > best {
			best = sSub
		}
		return best
	}
	basicSet := map[string]bool{}
	for _, name := range types.BasicLandNames {
		basicSet[name] = true
	}
	scoreAndCollect := func(name string, applyShortGate bool, minScore float64) {
		if best := scoreName(name, applyShortGate); best >= minScore {
			cands = append(cands, Candidate{Name: name, Score: best})
		}
	}
	cubeSet := map[string]bool{}
	for _, name := range cube.Names() {
		cubeSet[name] = true
		scoreAndCollect(name, true, 0)
	}

	// Also score basic lands, skipping the short-name gate and any already
	// in the cube. Drop ones below their own threshold so they don't skew
	// the gap against real cube cards.
	for _, name := range types.BasicLandNames {
		if cubeSet[name] {
			continue
		}
		scoreAndCollect(name, false, BasicLandThreshold)
	}
	sort.SliceStable(cands, func(i, j int) bool { return cands[i].Score > cands[j].Score })
	promoteContainedTop(cands)
	if len(cands) > 3 {
		cands = cands[:3]
	}

	r := MatchResult{
		DetectedText: text,
		Candidates:   cands,
	}
	second := 0.0
	if len(cands) > 1 {
		second = cands[1].Score
	}
	topIsBasic := len(cands) > 0 && basicSet[cands[0].Name] && !cubeSet[cands[0].Name]
	switch {
	case len(cands) == 0:
		r.Band = ConfidenceUnmatched
	case topIsBasic && cands[0].Score >= BasicLandThreshold:
		r.Band = ConfidenceHigh
	case cands[0].Score >= HighConfidenceThreshold:
		r.Band = ConfidenceHigh
	case cands[0].Score >= LowConfidenceThreshold && cands[0].Score-second >= HighConfidenceGap:
		r.Band = ConfidenceHigh
	case cands[0].Score >= LowConfidenceThreshold:
		r.Band = ConfidenceLow
	case cands[0].Score >= VeryLowConfidenceThreshold && cands[0].Score-second >= VeryLowConfidenceGap:
		r.Band = ConfidenceVeryLow
	default:
		r.Band = ConfidenceUnmatched
	}
	return r
}

// ContainmentSwapMargin: when the top name is a substring of a longer
// candidate scoring within this margin, swap the longer one to the front.
// The substring scorer's 1 - dist/len(name) formula favors shorter names
// ("Noble Hierarch" over "Ignoble Hierarch"), but the longer name's
// full-string score is the better signal here.
const ContainmentSwapMargin = 0.05

// promoteContainedTop rewrites cands in place so that, if the top
// candidate's name is contained in a longer candidate's name within
// ContainmentSwapMargin, the longer candidate takes the front slot.
func promoteContainedTop(cands []Candidate) {
	if len(cands) < 2 {
		return
	}
	topName := strings.ToLower(cands[0].Name)
	floor := cands[0].Score - ContainmentSwapMargin
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

// AnchorOverlap is how much a later match's bbox must overlap an accepted
// one (as a fraction of its own area) to be suppressed as a duplicate.
const AnchorOverlap = 0.5

// dedupeByAnchor greedily keeps the highest-scoring matches and suppresses any
// later match whose anchor bbox overlaps an already-accepted anchor by
// >= AnchorOverlap fraction of its own area.
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
			if overlapFraction(m.Bbox, a.Bbox) >= AnchorOverlap {
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
	q := []rune(query)
	n := []rune(name)
	if len(n) == 0 || len(q) == 0 {
		return 0
	}
	if len(q) < len(n) {
		return similarity(query, name)
	}
	prev := make([]int, len(q)+1)
	curr := make([]int, len(q)+1)
	for i := 1; i <= len(n); i++ {
		curr[0] = i
		for j := 1; j <= len(q); j++ {
			cost := 1
			if n[i-1] == q[j-1] {
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
	for j := 2; j <= len(q); j++ {
		if prev[j] < minDist {
			minDist = prev[j]
		}
	}
	return 1 - float64(minDist)/float64(len(n))
}

func similarity(a, b string) float64 {
	if a == "" && b == "" {
		return 1
	}
	d := levenshtein.ComputeDistance(a, b)
	longer := utf8.RuneCountInString(a)
	if rb := utf8.RuneCountInString(b); rb > longer {
		longer = rb
	}
	if longer == 0 {
		return 0
	}
	return 1 - float64(d)/float64(longer)
}
