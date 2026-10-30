package query

import (
	"slices"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/design"
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
	GetColors() types.ColorIdentity

	// GetEventTerms returns the words an event: term or free-text search can
	// match the deck's draft by: its event code, name, and flight.
	GetEventTerms() []string
}

// eventMatches reports whether any of the deck's event terms contains the
// lowercased query.
func eventMatches(d Deck, query string) bool {
	for _, t := range d.GetEventTerms() {
		if strings.Contains(strings.ToLower(t), query) {
			return true
		}
	}
	return false
}

func DeckMatches(d Deck, matchStr string) bool {
	return DeckMatchesBoard(d, matchStr, "")
}

// DeckMatchesBoard reports whether the deck matches the query. It can't evaluate
// a package: term without the cube's packages, so callers that support one use
// DeckMatchesBoardPackages instead.
func DeckMatchesBoard(d Deck, matchStr, board string) bool {
	return DeckMatchesBoardPackages(d, matchStr, board, nil)
}

// DeckMatchesBoardPackages reports whether the deck matches the query. Card
// terms match against the named board ("Sideboard" or "Pool", else the
// mainboard). A package: term checks the mainboard against pkgs, the cube's
// resolved packages; pass nil when no package term is present.
func DeckMatchesBoardPackages(d Deck, matchStr, board string, pkgs []design.PackageCards) bool {
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
		if eventMatches(d, fs) {
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

				// A whole name, so player:p3 doesn't also pick up seat p30.
				if !strings.EqualFold(d.GetPlayer(), val) {
					return false
				}
			} else if strings.HasPrefix(term, "event:") {
				val := strings.TrimPrefix(term, "event:")
				val = strings.Trim(val, "\"")
				if !eventMatches(d, strings.ToLower(val)) {
					return false
				}
			} else if strings.HasPrefix(term, "dcolor") {
				deckColors := d.GetColors().String()
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
			} else if name, negate, ok := packageTerm(term); ok {
				if deckBuildsPackage(d, pkgs, name) == negate {
					return false
				}
			}
		}
	}

	// 2. All card terms must be satisfied by at least one card in the deck.
	if len(cardTerms) > 0 {
		cards := boardCards(d, board)

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
			if strings.HasPrefix(term, "color:") || strings.HasPrefix(term, "color=") || strings.HasPrefix(term, "color!=") ||
				strings.HasPrefix(term, "c:") || strings.HasPrefix(term, "c=") || strings.HasPrefix(term, "c!=") {
				// c: is the Scryfall-style shorthand for color:. colorMatches only
				// looks at the separator and value, so the prefix name doesn't matter.
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
			} else if strings.HasPrefix(term, "cctag:") {
				// Exact match against the card's Cube Cobra tags (case-insensitive).
				val := strings.TrimPrefix(term, "cctag:")
				val = strings.Trim(val, "\"")
				if !slices.ContainsFunc(c.Tags, func(t string) bool { return strings.EqualFold(t, val) }) {
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
	queryTerms := []string{"color", "c", "dcolor", "cmc", "t", "o", "name", "pow", "games", "mb", "sb", "players", "drafts", "winpct", "arch", "player", "event", "draftSize", "minCards", "cctag"}
	splits := parseTerms(matchStr)
	for _, term := range splits {
		if _, _, ok := packageTerm(term); ok {
			return true
		}
		for _, qt := range queryTerms {
			if strings.HasPrefix(term, qt) && (strings.Contains(term, ":") || strings.Contains(term, "=") || strings.Contains(term, "<") || strings.Contains(term, ">") || strings.Contains(term, "!=")) {
				return true
			}
		}
	}
	return false
}

// boardCards returns the cards from the requested board. Card terms match
// against the mainboard by default; the decklist view's board toggle can widen
// this to the sideboard or pool explicitly.
func boardCards(d Deck, board string) []types.Card {
	switch board {
	case "Sideboard":
		return d.GetSideboard()
	case "Pool":
		return d.GetPool()
	default:
		return d.GetMainboard()
	}
}

func isDeckOnly(term string) bool {
	if _, _, ok := packageTerm(term); ok {
		return true
	}
	deckOnlyTerms := []string{"arch", "player", "event", "dcolor", "draftSize", "minCards"}
	for _, dot := range deckOnlyTerms {
		if strings.HasPrefix(term, dot) {
			return true
		}
	}
	return false
}

// HasPackageTerm reports whether the query has a package: term, which needs
// the cube's resolved packages to answer. Callers use it to load them only
// when a query asks for it.
func HasPackageTerm(matchStr string) bool {
	for _, term := range parseTerms(matchStr) {
		if _, _, ok := packageTerm(term); ok {
			return true
		}
	}
	return false
}

// packageTermPrefixes are the spellings of a package term and whether each
// negates. community: is the term's old name, kept so saved links still work.
var packageTermPrefixes = []packageTermPrefix{
	{prefix: "package!=", negate: true},
	{prefix: "package:", negate: false},
	{prefix: "community!=", negate: true},
	{prefix: "community:", negate: false},
}

// packageTermPrefix is one spelling of the package term.
type packageTermPrefix struct {
	prefix string
	negate bool
}

// packageTerm parses a package: term, returning the package name (empty means
// "any package"), whether it's negated, and whether it's a package term at all.
// Negation is a leading "-" or the "!=" operator, as elsewhere in the grammar.
func packageTerm(term string) (string, bool, bool) {
	t := term
	negate := false
	if strings.HasPrefix(t, "-") {
		negate = true
		t = t[1:]
	}
	for _, p := range packageTermPrefixes {
		if v, found := strings.CutPrefix(t, p.prefix); found {
			return strings.Trim(v, "\""), negate != p.negate, true
		}
	}
	return "", false, false
}

// deckBuildsPackage reports whether the deck's non-basic mainboard builds a
// package: any package for an empty name, else the one with that name. Always
// the mainboard, since packages are a mainboard notion. False when no packages
// are supplied.
func deckBuildsPackage(d Deck, pkgs []design.PackageCards, name string) bool {
	deck := make(map[string]bool)
	for _, c := range d.GetMainboard() {
		if types.IsBasic(c.Name) {
			continue
		}
		deck[c.Name] = true
	}
	for _, p := range pkgs {
		if name != "" && !strings.EqualFold(p.Name, name) {
			continue
		}
		if p.BuiltBy(deck) {
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
