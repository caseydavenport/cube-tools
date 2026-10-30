package stats

import (
	"encoding/json"
	"net/http"
	"sort"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// PackageStat is one package's build rate across decks: how often decks build
// it versus how often they merely carry enough of its cards.
type PackageStat struct {
	Name string `json:"name"`

	// Package is the number of populated decks that build the package, per
	// design.PackageCards.BuiltBy; BuildRate is that count over the populated
	// decks, bracketed by a Wilson interval at the request's confidence level.
	Package       int     `json:"package"`
	BuildRate     float64 `json:"buildRate"`
	BuildRateLow  float64 `json:"buildRateLow"`
	BuildRateHigh float64 `json:"buildRateHigh"`

	// Has3 is the number of decks carrying 3 or more of the package's cards,
	// per design.PackageCards.HasCards, built or not. CommitmentRatio is
	// Package/Has3: low means the cards show up but rarely come together.
	Has3            int     `json:"has3"`
	Has3Rate        float64 `json:"has3Rate"`
	CommitmentRatio float64 `json:"commitmentRatio"`
}

// PackageStatsResponse is the API response for /api/{cube}/stats/packages.
type PackageStatsResponse struct {
	Confidence     float64       `json:"confidence"`
	PopulatedDecks int           `json:"populatedDecks"`
	Packages       []PackageStat `json:"packages"`
}

func PackageStatsHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &packageStatsHandler{store: store, src: src, q: newQuery(store, src)}
}

type packageStatsHandler struct {
	store storage.DeckStorage
	src   types.CubeSource
	q     *deckquery.Query
}

func (h *packageStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	logrus.Info("/api/stats/packages")

	cubeID := server.CubeFromRequest(r)
	pkgs, err := PackagesForCube(h.store, h.src, cubeID)
	if err != nil {
		http.Error(rw, "could not load packages", http.StatusInternalServerError)
		return
	}

	// The packages are cube-wide; only the decks they're measured over follow
	// the date range and the deck filter.
	dr := &storage.DecksRequest{
		Start: query.GetString(r, "start"),
		End:   query.GetString(r, "end"),
		Match: query.GetString(r, "match"),
	}
	allDecks, err := h.q.Decks(cubeID, dr)
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	resp := packageStats(pkgs, allDecks, query.GetFloat(r, "confidence"))
	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write package stats response")
	}
}

// packageStats counts, for each package, the decks that build it and the
// decks that carry enough of its cards. A deck is populated when it has at
// least one non-basic mainboard card; empty decks stay out of the denominator
// so they can't drag every rate down. No populated decks means no rows.
func packageStats(pkgs []design.PackageCards, decks []*storage.Deck, conf float64) PackageStatsResponse {
	populated := 0
	has3 := map[string]int{}
	pkg := map[string]int{}

	for _, d := range decks {
		cards := nonBasicMainboard(d)
		if len(cards) == 0 {
			continue
		}
		populated++

		deck := make(map[string]bool, len(cards))
		for _, name := range cards {
			deck[name] = true
		}
		for _, p := range pkgs {
			if p.HasCards(deck) {
				has3[p.Name]++
			}
			if p.BuiltBy(deck) {
				pkg[p.Name]++
			}
		}
	}

	stats := []PackageStat{}
	if populated > 0 {
		z := zForConfidence(conf)
		n := float64(populated)
		for _, p := range pkgs {
			low, high := wilsonInterval(pkg[p.Name], populated-pkg[p.Name], 0, z)
			ratio := 0.0
			if has3[p.Name] > 0 {
				ratio = round3(float64(pkg[p.Name]) / float64(has3[p.Name]))
			}
			stats = append(stats, PackageStat{
				Name:            p.Name,
				Package:         pkg[p.Name],
				BuildRate:       round3(float64(pkg[p.Name]) / n),
				BuildRateLow:    round3(low / 100),
				BuildRateHigh:   round3(high / 100),
				Has3:            has3[p.Name],
				Has3Rate:        round3(float64(has3[p.Name]) / n),
				CommitmentRatio: ratio,
			})
		}
	}

	sort.Slice(stats, func(i, j int) bool {
		if stats[i].Package != stats[j].Package {
			return stats[i].Package > stats[j].Package
		}
		return stats[i].Name < stats[j].Name
	})

	return PackageStatsResponse{
		Confidence:     resolveConfidence(conf),
		PopulatedDecks: populated,
		Packages:       stats,
	}
}

// nonBasicMainboard returns the deck's non-basic mainboard card names. Basics
// never count toward a package.
func nonBasicMainboard(d *storage.Deck) []string {
	var out []string
	for _, c := range d.Mainboard {
		if types.IsBasic(c.Name) {
			continue
		}
		out = append(out, c.Name)
	}
	return out
}

// round3 rounds to three decimal places so JSON rates read as 0.442, not a long float tail.
func round3(v float64) float64 {
	return float64(int64(v*1000+0.5)) / 1000
}
