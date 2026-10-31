package stats

import (
	"maps"
	"net/http"
	"slices"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// RulesBoardResponse is the Rules editor's home: every package with what its
// card on the board shows, in rules-file order so package colors match the
// rest of the app, and the groups no wire uses.
type RulesBoardResponse struct {
	Packages     []BoardPackage `json:"packages"`
	UnusedGroups []BoardGroup   `json:"unused_groups"`
}

// BoardPackage is one package on the board. Stat is its build row over the
// date range. Wires keep the raw rule entries; Groups resolves each entry once,
// in wire order. Colors counts its cube cards under the color table's columns.
// SharesWith names packages using one of its groups, and OneCardGroups its
// groups with a single cube card.
type BoardPackage struct {
	Name          string         `json:"name"`
	Stat          PackageStat    `json:"stat"`
	Wires         []design.Wire  `json:"wires"`
	Groups        []BoardGroup   `json:"groups"`
	Colors        map[string]int `json:"colors"`
	SharesWith    []string       `json:"shares_with"`
	OneCardGroups []string       `json:"one_card_groups"`
}

// BoardGroup is a rule entry and its cube cards, sorted. A card entry keeps
// its "card:" name.
type BoardGroup struct {
	Name  string   `json:"name"`
	Cards []string `json:"cards"`
}

// RulesBoardHandler serves GET /api/{cube}/stats/rules-board. Build stats
// follow the date range; everything else comes from the rules and the cube.
func RulesBoardHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &rulesBoardHandler{q: newQuery(store, src), store: store, src: src}
}

type rulesBoardHandler struct {
	q     *deckquery.Query
	store storage.DeckStorage
	src   types.CubeSource
}

// ServeHTTP answers one board request.
func (h *rulesBoardHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	cubeID := server.CubeFromRequest(r)
	rules, err := loadDesignInputs(h.store, h.src, cubeID)
	if err != nil {
		logrus.WithError(err).Error("could not load the rules for the rules board")
		http.Error(rw, "could not load rules", http.StatusInternalServerError)
		return
	}
	decks, err := h.q.Decks(cubeID, &storage.DecksRequest{Start: query.GetString(r, "start"), End: query.GetString(r, "end")})
	if err != nil {
		logrus.WithError(err).Error("could not load decks for the rules board")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}
	writeJSON(rw, buildRulesBoard(rules, decks, query.GetFloat(r, "confidence")), "rules board")
}

// buildRulesBoard builds every package's board card and the unused groups.
func buildRulesBoard(rules designInputs, decks []*storage.Deck, conf float64) RulesBoardResponse {
	cardMap := buildCardMap(rules.cube)
	groups := resolveGroups(cardMap, rules.config, rules.deckCardNames).cube

	// Index the resolved packages and their build rows by name.
	resolved := map[string]design.PackageCards{}
	pkgs := resolvePackages(rules.cube, rules.config, rules.deckCardNames)
	for _, p := range pkgs {
		resolved[p.Name] = p
	}
	stats := map[string]PackageStat{}
	for _, s := range packageStats(pkgs, decks, conf).Packages {
		stats[s.Name] = s
	}

	// Index the packages each package shares a group with.
	shares := map[string][]string{}
	for _, e := range packageEdges(rules.config) {
		shares[e.Source] = append(shares[e.Source], e.Target)
		shares[e.Target] = append(shares[e.Target], e.Source)
	}

	resp := RulesBoardResponse{Packages: []BoardPackage{}, UnusedGroups: unusedGroups(rules.config, groups)}
	for _, pkg := range rules.config.Packages {
		cards := resolved[pkg.Name]
		stat := stats[pkg.Name]
		stat.Color = packageColor(cards, rules.cube)
		stat.CardCount = packageCardCount(cards, rules.cube)

		var names []string
		for _, c := range packageCubeCards(cards, rules.cube) {
			names = append(names, c.Name)
		}
		entries := boardGroups(pkg, groups)
		sharesWith := slices.Sorted(slices.Values(shares[pkg.Name]))
		if sharesWith == nil {
			sharesWith = []string{}
		}
		resp.Packages = append(resp.Packages, BoardPackage{
			Name:          pkg.Name,
			Stat:          stat,
			Wires:         pkg.Wires,
			Groups:        entries,
			Colors:        colorCounts(names, cardMap),
			SharesWith:    sharesWith,
			OneCardGroups: oneCardEntries(entries),
		})
	}
	return resp
}

// boardGroups lists each entry the package's wires name, once, in wire
// order, with its cube cards.
func boardGroups(pkg design.Package, cube map[string]map[string]bool) []BoardGroup {
	out := []BoardGroup{}
	for _, entry := range wireEntries(pkg) {
		out = append(out, BoardGroup{Name: entry, Cards: sortedCards(cube[entry])})
	}
	return out
}

// wireEntries lists each rule entry the package's wires name, once, in the
// order they first appear.
func wireEntries(pkg design.Package) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, w := range pkg.Wires {
		for _, entry := range slices.Concat(w.Sources, w.Targets) {
			if !seen[entry] {
				seen[entry] = true
				out = append(out, entry)
			}
		}
	}
	return out
}

// oneCardEntries names the groups with exactly one cube card. A card entry
// always has one card by design, so it never counts.
func oneCardEntries(groups []BoardGroup) []string {
	out := []string{}
	for _, g := range groups {
		if cardRefName(g.Name) == "" && len(g.Cards) == 1 {
			out = append(out, g.Name)
		}
	}
	return out
}

// unusedGroups lists the groups no wire names, in rules-file order.
func unusedGroups(config design.DesignMapConfig, cube map[string]map[string]bool) []BoardGroup {
	used := map[string]bool{}
	for _, p := range config.Packages {
		maps.Copy(used, packageGroups(p))
	}
	out := []BoardGroup{}
	for _, g := range config.Groups {
		if !used[g.Name] {
			out = append(out, BoardGroup{Name: g.Name, Cards: sortedCards(cube[g.Name])})
		}
	}
	return out
}

// sortedCards is a card set as a sorted list, never nil.
func sortedCards(cards map[string]bool) []string {
	out := slices.Sorted(maps.Keys(cards))
	if out == nil {
		return []string{}
	}
	return out
}
