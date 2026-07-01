package importer

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ImportSource is one player's raw decklist submitted for parsing.
type ImportSource struct {
	Player   string `json:"player"`
	Filename string `json:"filename,omitempty"`
	Content  string `json:"content"`
	Format   string `json:"format,omitempty"`
}

// ParseRequest carries one or more decklists to parse in a single call.
type ParseRequest struct {
	Sources []ImportSource `json:"sources"`
}

// ParseResponse returns the parsed decks and their consistency against the cube.
type ParseResponse struct {
	Decks  []ParsedDeck      `json:"decks"`
	Report ConsistencyReport `json:"report"`
}

// detectFormat picks ".txt" or ".csv" from an explicit format, then the
// filename suffix, then a content sniff (a header row with a comma looks CSV).
func detectFormat(src ImportSource) string {
	if src.Format == ".txt" || src.Format == ".csv" {
		return src.Format
	}
	name := strings.ToLower(src.Filename)
	if strings.HasSuffix(name, ".csv") {
		return ".csv"
	}
	if strings.HasSuffix(name, ".txt") {
		return ".txt"
	}
	first := src.Content
	if i := strings.IndexByte(first, '\n'); i >= 0 {
		first = first[:i]
	}
	if strings.Contains(first, ",") {
		return ".csv"
	}
	return ".txt"
}

// toCounted collapses a hydrated card slice into name+count pairs, sorted by
// name for stable output.
func toCounted(cards []types.Card) []CountedCard {
	counts := map[string]int{}
	for _, c := range cards {
		counts[c.Name]++
	}
	out := make([]CountedCard, 0, len(counts))
	for name, n := range counts {
		out = append(out, CountedCard{Name: name, Count: n})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// buildParsedDeck turns parsed mainboard/sideboard card slices into a
// ParsedDeck. A single list of >=45 cards (empty sideboard) is treated as a
// draft pool, matching the CLI's parseDeck heuristic.
func buildParsedDeck(player, filename string, mb, sb []types.Card) ParsedDeck {
	d := ParsedDeck{Player: player, Filename: filename}
	if len(sb) == 0 && len(mb) >= 45 {
		d.Pool = toCounted(mb)
		return d
	}
	d.Mainboard = toCounted(mb)
	d.Sideboard = toCounted(sb)
	return d
}

// parseCount parses a leading copy count like "2" from a decklist line token.
func parseCount(s string) (int, error) { return strconv.Atoi(s) }

// warnUnresolved appends a warning for every source line whose card name didn't
// resolve to oracle data, so the UI can flag misspellings before commit.
func warnUnresolved(content, format string) []string {
	var warnings []string
	if format != ".txt" {
		return warnings
	}
	for _, l := range strings.Split(content, "\n") {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		name := l
		if sp := strings.SplitN(l, " ", 2); len(sp) == 2 {
			if _, err := parseCount(sp[0]); err == nil {
				name = sp[1]
			}
		}
		if types.GetOracleData(name).Name == "" {
			warnings = append(warnings, "unresolved card: "+name)
		}
	}
	return warnings
}

// parseSources parses each source into a ParsedDeck, attaching warnings for
// unresolved card names.
func parseSources(sources []ImportSource) ([]ParsedDeck, error) {
	decks := make([]ParsedDeck, 0, len(sources))
	for _, src := range sources {
		format := detectFormat(src)
		mb, sb, err := commands.ParseDeckBytes([]byte(src.Content), format)
		if err != nil {
			return nil, err
		}
		d := buildParsedDeck(src.Player, src.Filename, mb, sb)
		d.Warnings = warnUnresolved(src.Content, format)
		decks = append(decks, d)
	}
	return decks, nil
}

// ParseHandler parses submitted decklists and checks them against the cube.
func ParseHandler() http.Handler { return ParseHandlerWithRoot("data") }

// ParseHandlerWithRoot is ParseHandler with an overridable data root.
func ParseHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		var req ParseRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "invalid request", http.StatusBadRequest)
			return
		}
		decks, err := parseSources(req.Sources)
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadRequest)
			return
		}
		cl, err := types.LoadCube(cubePath(dataRoot, cube))
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(rw, ParseResponse{Decks: decks, Report: CheckConsistency(cl, decks)})
	})
}
