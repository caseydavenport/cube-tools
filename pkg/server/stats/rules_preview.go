package stats

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// RulesPreviewResponse lists the packages a proposed rule set would change:
// how many decks build each under the current rules and under the proposal.
type RulesPreviewResponse struct {
	Packages []PackageChange `json:"packages"`
}

// PackageChange is one package's build count under the current rules (Now)
// and the proposal (After), over every deck. Now is 0 for a package the
// proposal adds.
type PackageChange struct {
	Name  string `json:"name"`
	Now   int    `json:"now"`
	After int    `json:"after"`
}

// RulesPreviewHandler serves POST /api/{cube}/stats/rules-preview. The body
// is a whole proposed rule set; nothing is saved. Counts follow the "start"
// and "end" query params.
func RulesPreviewHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &rulesPreviewHandler{store: store, src: src, q: newQuery(store, src)}
}

type rulesPreviewHandler struct {
	store storage.DeckStorage
	src   types.CubeSource
	q     *deckquery.Query
}

// ServeHTTP answers one preview: 400 for a body that isn't a rule set.
func (h *rulesPreviewHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	var proposed design.DesignMapConfig
	if err := json.NewDecoder(r.Body).Decode(&proposed); err != nil {
		http.Error(rw, "could not read the proposed rules", http.StatusBadRequest)
		return
	}
	cubeID := server.CubeFromRequest(r)
	rules, err := loadDesignInputs(h.store, h.src, cubeID)
	if err != nil {
		logrus.WithError(err).Error("could not load the rules for a preview")
		http.Error(rw, "could not load rules", http.StatusInternalServerError)
		return
	}
	decks, err := h.q.Decks(cubeID, &storage.DecksRequest{Start: query.GetString(r, "start"), End: query.GetString(r, "end")})
	if err != nil {
		logrus.WithError(err).Error("could not load decks for a preview")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Count over the decks in the date range, under both the saved rules and
	// the proposal.
	now := buildCounts(rules.packages(), decks)
	after := buildCounts(rules.packagesWith(proposed), decks)
	writeJSON(rw, RulesPreviewResponse{Packages: packageChanges(now, after)}, "rules preview")
}

// buildCounts counts the decks that build each package.
func buildCounts(pkgs []design.PackageCards, decks []*storage.Deck) map[string]int {
	counts := map[string]int{}
	for _, p := range pkgs {
		counts[p.Name] = 0
	}
	for _, d := range decks {
		deck := deckCardSet(d)
		for _, p := range pkgs {
			if p.BuiltBy(deck) {
				counts[p.Name]++
			}
		}
	}
	return counts
}

// packageChanges lists the proposal's packages whose count differs from the
// current rules', or that the current rules lack, sorted by name.
func packageChanges(now, after map[string]int) []PackageChange {
	out := []PackageChange{}
	for name, count := range after {
		before, existed := now[name]
		if existed && before == count {
			continue
		}
		out = append(out, PackageChange{Name: name, Now: before, After: count})
	}
	slices.SortFunc(out, func(a, b PackageChange) int { return strings.Compare(a.Name, b.Name) })
	return out
}
