package stats

import (
	"errors"
	"maps"
	"net/http"
	"strconv"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/rulebook"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// defaultThin is the most cube cards a role can already hold for a package
// to count toward New connections, unless the request says otherwise.
const defaultThin = 10

// explorerPoolFunc supplies the explorer's card pool; tests swap it for a
// small pool.
var explorerPoolFunc = explorerPool

// MaybeboardStatus says whether the cube has a CubeCobra maybeboard to filter
// by, and why the last fetch failed when it did.
type MaybeboardStatus struct {
	Available bool   `json:"available"`
	Error     string `json:"error,omitempty"`
}

// ExplorerResponse is the explorer's answer: candidates and cube cards, each
// sorted as asked and cut to the asked-for rows, with how many there are in
// all, and the maybeboard's status.
type ExplorerResponse struct {
	Candidates      []ExplorerCard   `json:"candidates"`
	CandidatesTotal int              `json:"candidates_total"`
	InCube          []ExplorerCard   `json:"in_cube"`
	InCubeTotal     int              `json:"in_cube_total"`
	Maybeboard      MaybeboardStatus `json:"maybeboard"`
}

// ExplorerHandler serves GET /api/{cube}/stats/explorer. "q" is a search over
// every card, and with none only the cube's cards are scored; "maybe=1" limits
// the search, or with none shows, the cube's CubeCobra maybeboard. "thin" sets the New connections cutoff,
// "all=1" keeps cards in no group and on no wire, and "sort", "dir" and
// "limit" order each table and cut it. maybe may be nil without CubeCobra.
func ExplorerHandler(store storage.DeckStorage, src types.CubeSource, maybe MaybeboardSource) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cubeID := server.CubeFromRequest(r)
		typed := strings.TrimSpace(query.GetString(r, "q"))
		useMaybe := query.GetString(r, "maybe") == "1"
		searchQuery, err := search.Compile(typed, search.TargetRules)
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadRequest)
			return
		}
		resp := ExplorerResponse{Candidates: []ExplorerCard{}, InCube: []ExplorerCard{}}

		names, status := maybeboardFor(maybe, cubeID)
		resp.Maybeboard = status
		filterMaybe := useMaybe && names != nil

		rules, err := rulebook.Load(store, src, cubeID)
		if err != nil {
			logrus.WithError(err).Error("could not load the rules for the explorer")
			http.Error(rw, "could not load rules", http.StatusInternalServerError)
			return
		}

		pool := explorerPoolFunc()
		if filterMaybe {
			pool = pickCards(pool, maybeboardNames(names, pool))
		}
		hits := pool
		switch {
		case !searchQuery.Empty():
			hits = pickCards(pool, matchQuery(pool, searchQuery))
		case !filterMaybe:
			// With no search, the page opens on the cube's own cards.
			hits = cubeHits(pool, rules.CardMap())
		}

		cards := exploreCards(hits, newExplorerRules(rules, rules.Shown(rulebook.Today).Config()), thinParam(r))
		keepAll := query.GetString(r, "all") == "1"
		for _, c := range cards {
			if len(c.Groups) == 0 && len(c.Joins) == 0 && !keepAll {
				continue
			}
			if c.InCube {
				resp.InCube = append(resp.InCube, c)
			} else {
				resp.Candidates = append(resp.Candidates, c)
			}
		}
		order, limit := sortParams(r), limitParam(r)
		resp.CandidatesTotal, resp.InCubeTotal = len(resp.Candidates), len(resp.InCube)
		sortExplorerCards(resp.Candidates, order)
		sortExplorerCards(resp.InCube, order)
		resp.Candidates = resp.Candidates[:min(limit, len(resp.Candidates))]
		resp.InCube = resp.InCube[:min(limit, len(resp.InCube))]
		writeJSON(rw, resp, "explorer")
	})
}

// maybeboardFor asks maybe for the cube's maybeboard. It returns nil names
// when there's none to filter by: no source, no CubeCobra id, or a failed
// fetch, which the status reports.
func maybeboardFor(maybe MaybeboardSource, cubeID string) ([]string, MaybeboardStatus) {
	if maybe == nil {
		return nil, MaybeboardStatus{}
	}
	names, err := maybe(cubeID)
	if errors.Is(err, cubes.ErrNoCubeCobra) {
		return nil, MaybeboardStatus{}
	}
	if err != nil {
		logrus.WithError(err).WithField("cube", cubeID).Warn("could not fetch the CubeCobra maybeboard")
		return nil, MaybeboardStatus{Available: true, Error: "Couldn't reach CubeCobra for the maybeboard."}
	}
	if names == nil {
		names = []string{}
	}
	return names, MaybeboardStatus{Available: true}
}

// thinParam reads "thin", defaulting to defaultThin and treating a negative
// value as 0.
func thinParam(r *http.Request) int {
	raw := query.GetString(r, "thin")
	if raw == "" {
		return defaultThin
	}
	thin, err := strconv.Atoi(raw)
	if err != nil {
		return defaultThin
	}
	return max(thin, 0)
}

// cubeHits is the cube's cards to score, basics left out. Each takes its full
// oracle card from pool when there is one, since the cube's own copy can lack
// tags and an image.
func cubeHits(pool, cube map[string]types.Card) map[string]types.Card {
	out := maps.Clone(cube)
	for name := range out {
		if c, ok := pool[name]; ok {
			out[name] = c
		}
	}
	return out
}

// pickCards returns the cards in pool named in names.
func pickCards(pool map[string]types.Card, names map[string]bool) map[string]types.Card {
	out := make(map[string]types.Card, len(names))
	for name := range names {
		if c, ok := pool[name]; ok {
			out[name] = c
		}
	}
	return out
}

// matchQuery returns the names of the cards a compiled search matches.
func matchQuery(cards map[string]types.Card, q *search.Query) map[string]bool {
	result := make(map[string]bool)
	for name, card := range cards {
		if q.MatchPrepared(search.Prepare(card, nil)) {
			result[name] = true
		}
	}
	return result
}
