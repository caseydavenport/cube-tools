package stats

import (
	"encoding/json"
	"net/http"
	"sort"

	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// PackageStat is one rule label's corpus build rate: how often its cards cohere
// into a package versus how often the deck merely carries enough of them.
type PackageStat struct {
	Label string `json:"label"`

	// Package is the number of populated decks where this label's cards form a
	// cohesive community; BuildRate is that count over the populated-deck total,
	// bracketed by a Wilson interval at the request's confidence level.
	Package       int     `json:"package"`
	BuildRate     float64 `json:"buildRate"`
	BuildRateLow  float64 `json:"buildRateLow"`
	BuildRateHigh float64 `json:"buildRateHigh"`

	// Has3 is the number of decks carrying >=3 cards that touch this label -
	// package-sized footprint, whether or not the cards cohere. CommitmentRatio
	// is Package/Has3: low means the cards show up but rarely form a strategy.
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

func PackageStatsHandler(src types.CubeSource) http.Handler {
	return &packageStatsHandler{store: storage.NewFileDeckStoreWithCache(src), src: src}
}

type packageStatsHandler struct {
	store storage.DeckStorage
	src   types.CubeSource
}

func (h *packageStatsHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	logrus.Info("/api/stats/packages")

	cubeID := server.CubeFromRequest(r)
	graph, err := DesignGraphForCube(h.src, cubeID)
	if err != nil {
		http.Error(rw, "could not load design graph", http.StatusInternalServerError)
		return
	}

	allDecks, err := h.store.List(cubeID, &storage.DecksRequest{})
	if err != nil {
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	resp := packageStats(graph, allDecks, query.GetFloat(r, "confidence"))
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

// packageStats induces each populated deck's subgraph, clusters it, and rolls the
// per-deck footprints up to a per-label build rate. A deck is populated when it
// has at least one non-basic mainboard card; empty decks stay out of the
// denominator so they can't drag every rate down.
func packageStats(designGraph DesignGraphResponse, decks []*storage.Deck, conf float64) PackageStatsResponse {
	edges := toGraphEdges(designGraph)

	populated := 0
	has3 := map[string]int{}
	pkg := map[string]int{}
	labels := map[string]bool{}

	for _, d := range decks {
		cards := nonBasicMainboard(d)
		if len(cards) == 0 {
			continue
		}
		populated++

		g := graph.BuildDeckSubgraph(cards, edges)

		// Tag footprint: distinct cards touching each label's edges. A card counts
		// for a label when it is an endpoint of an edge carrying that label.
		labelCards := map[string]map[string]bool{}
		for _, e := range g.Edges {
			for _, l := range e.Labels {
				if labelCards[l] == nil {
					labelCards[l] = map[string]bool{}
				}
				labelCards[l][e.A] = true
				labelCards[l][e.B] = true
			}
		}
		for l, s := range labelCards {
			labels[l] = true
			if len(s) >= graph.MinPackageSize {
				has3[l]++
			}
		}

		// Package footprint: each cohesive community contributes its dominant
		// label once per deck, so a deck with two Graveyard clusters still counts
		// as one Graveyard build.
		deckPackages := map[string]bool{}
		for _, lab := range g.PackageLabels() {
			deckPackages[lab] = true
		}
		for l := range deckPackages {
			labels[l] = true
			pkg[l]++
		}
	}

	z := zForConfidence(conf)
	n := float64(populated)
	stats := make([]PackageStat, 0, len(labels))
	for l := range labels {
		low, high := wilsonInterval(pkg[l], populated-pkg[l], 0, z)
		ratio := 0.0
		if has3[l] > 0 {
			ratio = round3(float64(pkg[l]) / float64(has3[l]))
		}
		buildRate := 0.0
		has3Rate := 0.0
		if populated > 0 {
			buildRate = round3(float64(pkg[l]) / n)
			has3Rate = round3(float64(has3[l]) / n)
		}
		stats = append(stats, PackageStat{
			Label:           l,
			Package:         pkg[l],
			BuildRate:       buildRate,
			BuildRateLow:    round3(low / 100),
			BuildRateHigh:   round3(high / 100),
			Has3:            has3[l],
			Has3Rate:        has3Rate,
			CommitmentRatio: ratio,
		})
	}

	sort.Slice(stats, func(i, j int) bool {
		if stats[i].Package != stats[j].Package {
			return stats[i].Package > stats[j].Package
		}
		return stats[i].Label < stats[j].Label
	})

	return PackageStatsResponse{
		Confidence:     resolveConfidence(conf),
		PopulatedDecks: populated,
		Packages:       stats,
	}
}

// EdgesForCube loads a cube's design graph and returns its clustering edges, so
// the deck filter can ask whether a deck's cards cohere into a package without
// depending on the stats package's response types.
func EdgesForCube(src types.CubeSource, cubeID string) ([]graph.Edge, error) {
	resp, err := DesignGraphForCube(src, cubeID)
	if err != nil {
		return nil, err
	}
	return toGraphEdges(resp), nil
}

// toGraphEdges converts the design graph's edges into the clustering edge type.
func toGraphEdges(designGraph DesignGraphResponse) []graph.Edge {
	out := make([]graph.Edge, 0, len(designGraph.Edges))
	for _, e := range designGraph.Edges {
		out = append(out, graph.Edge{A: e.Source, B: e.Target, Weight: e.Weight, Labels: e.RuleLabels})
	}
	return out
}

// nonBasicMainboard returns the deck's non-basic mainboard card names, matching
// the Map view (which hides basics because they carry no rule edges).
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
