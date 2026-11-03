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

const (
	// rarelyTogetherMinDecks is how many decks must have had a package's cards
	// before it can be flagged as rarely coming together.
	rarelyTogetherMinDecks = 10

	// rarelyTogetherShare flags a package whose came-together rate is under
	// this share of the median rate across packages.
	rarelyTogetherShare = 0.5
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

	// Has3 counts decks carrying 3 or more of the package's cards, built or
	// not. CameTogether is Package/Has3, and RarelyTogether flags a package
	// whose rate is low against the others.
	Has3           int     `json:"has3"`
	Has3Rate       float64 `json:"has3Rate"`
	CameTogether   float64 `json:"cameTogether"`
	RarelyTogether bool    `json:"rarelyTogether"`

	// Record is how the decks that built the package did.
	Record Record `json:"record"`

	// Color is the package's main Magic color, "" for none, and CardCount how
	// many cube cards its wires use.
	Color     string `json:"color"`
	CardCount int    `json:"cardCount"`
}

// PackageStatsResponse is the API response for /api/{cube}/stats/packages.
// Edges join packages that share groups, and MostLinked ranks the cards in
// the most packages; both come from the rules, not the decks.
type PackageStatsResponse struct {
	Confidence     float64       `json:"confidence"`
	PopulatedDecks int           `json:"populatedDecks"`
	Packages       []PackageStat `json:"packages"`
	Edges          []PackageEdge `json:"edges"`
	MostLinked     []NamedCount  `json:"mostLinked"`
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
	rules, err := loadDesignInputs(h.store, h.src, cubeID)
	if err != nil {
		http.Error(rw, "could not load packages", http.StatusInternalServerError)
		return
	}
	// Only the decks the packages are measured over follow the date range and
	// the deck filter; the packages shown are those any of their drafts' lists
	// support.
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

	rules.config = rules.relevantConfig(relevantInAny(draftIDsOf(allDecks)))
	pkgs := rules.packages()
	resp := packageStats(pkgs, allDecks, query.GetFloat(r, "confidence"))
	addPackageShapes(&resp, pkgs, rules)
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

// packageStats counts, for each package, the decks that build it, the decks
// that carry enough of its cards, and how the builders did. A deck is
// populated when it has at least one non-basic mainboard card; empty decks
// stay out of the denominator so they can't drag every rate down. With no
// populated decks every package gets a row at zero.
func packageStats(pkgs []design.PackageCards, decks []*storage.Deck, conf float64) PackageStatsResponse {
	populated := 0
	has3 := map[string]int{}
	pkg := map[string]int{}
	records := map[string]*Record{}
	for _, p := range pkgs {
		records[p.Name] = &Record{}
	}

	for _, d := range decks {
		cards := nonBasicMainboard(d)
		if len(cards) == 0 {
			continue
		}
		populated++

		deck := deckCardSet(d)
		for _, p := range pkgs {
			if p.HasCards(deck) {
				has3[p.Name]++
			}
			if p.BuiltIn(d.Metadata.DraftID, deck) {
				pkg[p.Name]++
				records[p.Name].Add(d)
			}
		}
	}

	zScore := zForConfidence(conf)
	stats := []PackageStat{}
	for _, p := range pkgs {
		stat := PackageStat{Name: p.Name, Package: pkg[p.Name], Has3: has3[p.Name]}
		if populated > 0 {
			n := float64(populated)
			low, high := wilsonInterval(pkg[p.Name], populated-pkg[p.Name], 0, zScore)
			stat.BuildRate = round3(float64(pkg[p.Name]) / n)
			stat.BuildRateLow = round3(low / 100)
			stat.BuildRateHigh = round3(high / 100)
			stat.Has3Rate = round3(float64(has3[p.Name]) / n)
		}
		if has3[p.Name] > 0 {
			stat.CameTogether = round3(float64(pkg[p.Name]) / float64(has3[p.Name]))
		}
		record := records[p.Name]
		record.Finalize()
		record.SetBayesian(archetypeBayesPriorGames)
		record.SetInterval(zScore)
		stat.Record = *record
		stats = append(stats, stat)
	}
	markRarelyTogether(stats)

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
		Edges:          []PackageEdge{},
		MostLinked:     []NamedCount{},
	}
}

// markRarelyTogether flags the packages whose cards show up but rarely form
// the package: at least rarelyTogetherMinDecks decks had the cards, and the
// came-together rate is under rarelyTogetherShare of the median across such
// packages. The cutoff is relative, so it works for any cube's rules.
func markRarelyTogether(stats []PackageStat) {
	var rates []float64
	for _, s := range stats {
		if s.Has3 >= rarelyTogetherMinDecks {
			rates = append(rates, s.CameTogether)
		}
	}
	if len(rates) == 0 {
		return
	}
	cutoff := rarelyTogetherShare * median(rates)
	for i := range stats {
		if stats[i].Has3 >= rarelyTogetherMinDecks && stats[i].CameTogether < cutoff {
			stats[i].RarelyTogether = true
		}
	}
}

// addPackageShapes fills in what the rules alone decide: each package's color
// and card count, the edges between packages, and the most-linked cards.
func addPackageShapes(resp *PackageStatsResponse, pkgs []design.PackageCards, in designInputs) {
	byName := map[string]design.PackageCards{}
	for _, p := range pkgs {
		byName[p.Name] = p
	}
	for i := range resp.Packages {
		p := byName[resp.Packages[i].Name]
		resp.Packages[i].Color = packageColor(p, in.cube)
		resp.Packages[i].CardCount = packageCardCount(p, in.cube)
	}
	resp.Edges = packageEdges(in.config)
	resp.MostLinked = mostLinked(pkgs, in.cube, mostLinkedShown)
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
