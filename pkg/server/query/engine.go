package query

import (
	"slices"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// Deck interface to avoid circular dependency with storage package
type Deck interface {
	GetPlayer() string
	GetLabels() []string
	GetDraftSize() int
	GetMainboard() []types.Card
	GetSideboard() []types.Card
	GetPool() []types.Card
	GetColors() []string
}

func DeckMatches(d Deck, matchStr string) bool {
	if matchStr == "" {
		return true
	}

	splits := parseTerms(matchStr)
	isTerm := isTermQuery(matchStr)

	var deckTerms []string
	var cardTerms []string

	if isTerm {
		for _, term := range splits {
			if isDeckOnly(term) {
				deckTerms = append(deckTerms, term)
			} else {
				cardTerms = append(cardTerms, term)
			}
		}
	} else {
		// Fuzzy search: check player name and labels first.
		fs := strings.ToLower(matchStr)
		if strings.Contains(strings.ToLower(d.GetPlayer()), fs) {
			return true
		}
		for _, label := range d.GetLabels() {
			if strings.Contains(strings.ToLower(label), fs) {
				return true
			}
		}
		// If not matched, treat the fuzzy string as a card term.
		cardTerms = append(cardTerms, matchStr)
	}

	// 1. All deck terms must match.
	if len(deckTerms) > 0 {
		for _, term := range deckTerms {
			if strings.HasPrefix(term, "arch:") || strings.HasPrefix(term, "arch!=") {
				if !deckTypeMatches(term, d) {
					return false
				}
			} else if strings.HasPrefix(term, "player:") {
				val := strings.TrimPrefix(term, "player:")
				val = strings.Trim(val, "\"")
				if !strings.Contains(strings.ToLower(d.GetPlayer()), strings.ToLower(val)) {
					return false
				}
			} else if strings.HasPrefix(term, "dcolor") {
				deckColors := combineColors(d.GetColors())
				if strings.HasPrefix(term, "dcolor!=") {
					val := strings.TrimPrefix(term, "dcolor!=")
					query := combineColors(strings.Split(val, ""))
					if query == deckColors {
						return false
					}
				} else if strings.HasPrefix(term, "dcolor=") {
					val := strings.TrimPrefix(term, "dcolor=")
					query := combineColors(strings.Split(val, ""))
					if query != deckColors {
						return false
					}
				} else if strings.HasPrefix(term, "dcolor:") {
					query := strings.TrimPrefix(term, "dcolor:")
					for _, c := range strings.Split(query, "") {
						if !strings.Contains(strings.ToLower(deckColors), strings.ToLower(c)) {
							return false
						}
					}
				}
			} else if strings.HasPrefix(term, "draftSize") {
				val := 0
				matches := false
				if strings.HasPrefix(term, "draftSize<") {
					val, _ = strconv.Atoi(strings.TrimPrefix(term, "draftSize<"))
					matches = d.GetDraftSize() < val
				} else if strings.HasPrefix(term, "draftSize>") {
					val, _ = strconv.Atoi(strings.TrimPrefix(term, "draftSize>"))
					matches = d.GetDraftSize() > val
				} else if strings.HasPrefix(term, "draftSize=") {
					val, _ = strconv.Atoi(strings.TrimPrefix(term, "draftSize="))
					matches = d.GetDraftSize() == val
				}
				if !matches {
					return false
				}
			}
		}
	}

	// 2. All card terms must be satisfied by at least one card in the deck.
	if len(cardTerms) > 0 {
		cards := append(d.GetMainboard(), d.GetSideboard()...)
		cards = append(cards, d.GetPool()...)

		for _, term := range cardTerms {
			matched := false
			for _, card := range cards {
				if CardMatches(card, term) {
					matched = true
					break
				}
			}
			if !matched {
				return false
			}
		}
	}

	return true
}

func CardMatches(c types.Card, matchStr string) bool {
	if matchStr == "" {
		return true
	}

	if isTermQuery(matchStr) {
		splits := parseTerms(matchStr)
		for _, term := range splits {
			if strings.HasPrefix(term, "color:") || strings.HasPrefix(term, "color=") || strings.HasPrefix(term, "color!=") {
				if !colorMatches(term, c) {
					return false
				}
			} else if strings.HasPrefix(term, "t:") {
				val := strings.TrimPrefix(term, "t:")
				val = strings.Trim(val, "\"")
				found := false
				for _, t := range c.Types {
					if strings.EqualFold(t, val) {
						found = true
						break
					}
				}
				if !found {
					return false
				}
			} else if strings.HasPrefix(term, "name:") {
				val := strings.TrimPrefix(term, "name:")
				val = strings.Trim(val, "\"")
				if !strings.Contains(strings.ToLower(c.Name), strings.ToLower(val)) {
					return false
				}
			} else if strings.HasPrefix(term, "cmc") {
				if !cmcMatches(term, c) {
					return false
				}
			} else if strings.HasPrefix(term, "pow") {
				if !powMatches(term, c) {
					return false
				}
			} else if strings.HasPrefix(term, "o:") {
				val := strings.TrimPrefix(term, "o:")
				val = strings.Trim(val, "\"")
				if !strings.Contains(strings.ToLower(c.OracleText), strings.ToLower(val)) {
					return false
				}
			}
			// Add other card terms as needed
		}
		return true
	}

	if strings.Contains(strings.ToLower(c.Name), strings.ToLower(matchStr)) {
		return true
	}
	if strings.Contains(strings.ToLower(c.OracleText), strings.ToLower(matchStr)) {
		return true
	}
	return false
}

func parseTerms(matchStr string) []string {
	var terms []string
	var current strings.Builder
	inQuotes := false
	for _, r := range matchStr {
		if r == '"' {
			inQuotes = !inQuotes
			current.WriteRune(r)
		} else if r == ' ' && !inQuotes {
			if current.Len() > 0 {
				terms = append(terms, current.String())
				current.Reset()
			}
		} else {
			current.WriteRune(r)
		}
	}
	if current.Len() > 0 {
		terms = append(terms, current.String())
	}
	return terms
}

func isTermQuery(matchStr string) bool {
	queryTerms := []string{"color", "dcolor", "cmc", "t", "o", "name", "pow", "games", "mb", "sb", "players", "drafts", "winpct", "arch", "player", "draftSize", "minCards"}
	splits := parseTerms(matchStr)
	for _, term := range splits {
		for _, qt := range queryTerms {
			if strings.HasPrefix(term, qt) && (strings.Contains(term, ":") || strings.Contains(term, "=") || strings.Contains(term, "<") || strings.Contains(term, ">") || strings.Contains(term, "!=")) {
				return true
			}
		}
	}
	return false
}

func isDeckOnly(term string) bool {
	deckOnlyTerms := []string{"arch", "player", "dcolor", "draftSize", "minCards"}
	for _, dot := range deckOnlyTerms {
		if strings.HasPrefix(term, dot) {
			return true
		}
	}
	return false
}

func deckTypeMatches(term string, d Deck) bool {
	val := strings.TrimPrefix(term, "arch:")
	val = strings.TrimPrefix(val, "arch!=")
	val = strings.Trim(val, "\"")
	isNot := strings.Contains(term, "!=")

	found := false
	for _, l := range d.GetLabels() {
		if strings.EqualFold(l, val) {
			found = true
			break
		}
	}

	if isNot {
		return !found
	}
	return found
}

func colorMatches(term string, c types.Card) bool {
	cardColors := combineColors(c.Colors)
	if strings.Contains(term, "!=") {
		val := strings.Split(term, "!=")[1]
		query := combineColors(strings.Split(val, ""))
		return query != cardColors
	} else if strings.Contains(term, "=") {
		val := strings.Split(term, "=")[1]
		query := combineColors(strings.Split(val, ""))
		return query == cardColors
	} else if strings.Contains(term, ":") {
		val := strings.Split(term, ":")[1]
		for _, color := range strings.Split(val, "") {
			if !strings.Contains(strings.ToLower(cardColors), strings.ToLower(color)) {
				return false
			}
		}
		return true
	}
	return true
}

func cmcMatches(term string, c types.Card) bool {
	var val int
	if strings.Contains(term, "<") {
		val, _ = strconv.Atoi(strings.Split(term, "<")[1])
		return c.CMC < val
	} else if strings.Contains(term, ">") {
		val, _ = strconv.Atoi(strings.Split(term, ">")[1])
		return c.CMC > val
	} else if strings.Contains(term, "=") {
		val, _ = strconv.Atoi(strings.Split(term, "=")[1])
		return c.CMC == val
	}
	return true
}

func powMatches(term string, c types.Card) bool {
	p, err := strconv.Atoi(c.Power)
	if err != nil {
		return false
	}
	var val int
	if strings.Contains(term, "<") {
		val, _ = strconv.Atoi(strings.Split(term, "<")[1])
		return p < val
	} else if strings.Contains(term, ">") {
		val, _ = strconv.Atoi(strings.Split(term, ">")[1])
		return p > val
	} else if strings.Contains(term, "=") {
		val, _ = strconv.Atoi(strings.Split(term, "=")[1])
		return p == val
	}
	return true
}

var colorOrder = map[string]int{
	"W": 0, "U": 1, "B": 2, "R": 3, "G": 4,
}

func combineColors(colors []string) string {
	slices.SortFunc(colors, func(a, b string) int {
		return colorOrder[strings.ToUpper(a)] - colorOrder[strings.ToUpper(b)]
	})
	return strings.ToUpper(strings.Join(colors, ""))
}
