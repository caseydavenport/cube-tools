package commands

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

// FetchCube builds a cube's card list from its CubeCobra list: the mainboard
// names hydrated from oracle data, then enriched with CubeCobra draft Elo, the
// printings the cube owner picked, and their per-card tags.
func FetchCube(baseURL, ccID string) (*types.Cube, error) {
	ccCube, err := fetchCubeCobra(http.DefaultClient, baseURL, ccID)
	if err != nil {
		return nil, err
	}

	cards := []types.Card{}
	for _, name := range ccCube.mainboardNames() {
		oracle := types.GetOracleData(name)
		if oracle.Name == "" {
			logrus.WithField("card", name).Error("Failed to find oracle data")
			continue
		}
		cards = append(cards, types.FromOracle(oracle))
	}
	mergeCubeCobra(cards, ccCube.cardInfo())
	return &types.Cube{Cards: cards}, nil
}

// liveCube fetches a cube's current card list from Cube Cobra. CLI commands use
// it wherever they used to read data/{cube}/cube.json; the server reads through
// the cached provider instead.
func liveCube(cube string) (*types.Cube, error) {
	id := cubeCobraID(cube)
	if id == "" {
		return nil, fmt.Errorf("cube %q has no Cube Cobra id", cube)
	}
	return FetchCube(ccBaseURL, id)
}

// mergeCubeCobra overlays Cube Cobra draft Elo and printings onto cards, keyed
// by name. It returns the number of cards matched.
func mergeCubeCobra(cards []types.Card, ccCards map[string]ccCardInfo) int {
	matched := 0
	for i := range cards {
		info, ok := ccCards[cards[i].Name]
		if !ok {
			// Cube Cobra keys double-faced cards by their front-face name,
			// while our cube list uses the full "Front // Back" name. Retry
			// on the front face.
			if front, _, found := strings.Cut(cards[i].Name, " // "); found {
				info, ok = ccCards[strings.TrimSpace(front)]
			}
		}
		if !ok {
			continue
		}
		cards[i].DraftELO = info.elo

		// Prefer the printing the cube owner picked on Cube Cobra over
		// whatever printing our oracle bulk happens to carry.
		if info.image != "" {
			cards[i].Image = info.image
		}
		if info.url != "" {
			cards[i].URL = info.url
		}
		cards[i].Tags = info.tags
		matched++
	}
	return matched
}

// CubeProvider serves cube card lists from CubeCobra, caching one copy per cube
// in memory. It's the server's source of truth now that cube lists aren't kept
// on disk.
type CubeProvider struct {
	reg *cubes.Registry

	mu    sync.RWMutex
	cache map[string]*types.Cube

	// maybe caches each cube's CubeCobra maybeboard for maybeboardTTL.
	maybeMu sync.Mutex
	maybe   map[string]cachedMaybeboard
}

const (
	// maybeboardTTL is how long a fetched maybeboard is reused before CubeCobra
	// is asked again.
	maybeboardTTL = 10 * time.Minute

	// maybeboardRetry is how long a failed fetch is remembered, so a CubeCobra
	// outage doesn't slow every explorer request.
	maybeboardRetry = time.Minute
)

// maybeboardClient fetches maybeboards, with a timeout so a stalled
// CubeCobra can't hang the explorer.
var maybeboardClient = &http.Client{Timeout: 5 * time.Second}

// cachedMaybeboard is one cube's last maybeboard fetch: its names, or the
// error when it failed, and when it ran.
type cachedMaybeboard struct {
	names   []string
	err     error
	fetched time.Time
}

// fresh reports whether the entry can still be used: a maybeboard for
// maybeboardTTL, a failure for maybeboardRetry.
func (c cachedMaybeboard) fresh() bool {
	if c.err != nil {
		return time.Since(c.fetched) < maybeboardRetry
	}
	return time.Since(c.fetched) < maybeboardTTL
}

// NewCubeProvider builds a provider backed by the given cube registry.
func NewCubeProvider(reg *cubes.Registry) *CubeProvider {
	return &CubeProvider{
		reg:   reg,
		cache: map[string]*types.Cube{},
		maybe: map[string]cachedMaybeboard{},
	}
}

// Maybeboard returns the card names on the cube's CubeCobra maybeboard,
// cached for maybeboardTTL; a failed fetch is cached for maybeboardRetry. The
// lock isn't held during the fetch, so one cube's slow fetch doesn't block
// another's. A cube with no CubeCobra id gives cubes.ErrNoCubeCobra.
func (p *CubeProvider) Maybeboard(cube string) ([]string, error) {
	ccID := p.cubeCobraID(cube)
	if ccID == "" {
		return nil, cubes.ErrNoCubeCobra
	}

	p.maybeMu.Lock()
	entry, ok := p.maybe[cube]
	p.maybeMu.Unlock()
	if ok && entry.fresh() {
		return entry.names, entry.err
	}

	names, err := FetchMaybeboard(ccBaseURL, ccID)
	p.maybeMu.Lock()
	p.maybe[cube] = cachedMaybeboard{names: names, err: err, fetched: time.Now()}
	p.maybeMu.Unlock()
	return names, err
}

// cubeCobraID is the cube's CubeCobra id: carried by a cc: cube id, or set
// in the registry. It's empty when the cube has none.
func (p *CubeProvider) cubeCobraID(cube string) string {
	if cubes.IsCubeCobra(cube) {
		return cubes.CubeCobraID(cube)
	}
	if meta, ok := p.reg.Get(cube); ok {
		return meta.CubeCobraID
	}
	return ""
}

// Current returns the cube's cached card list, fetching from CubeCobra on a
// cache miss.
func (p *CubeProvider) Current(cube string) (*types.Cube, error) {
	p.mu.RLock()
	c, ok := p.cache[cube]
	p.mu.RUnlock()
	if ok {
		return c, nil
	}
	return p.Refresh(cube)
}

// Refresh re-fetches the cube from CubeCobra and replaces the cached copy. A
// cc: cube resolves straight to its CubeCobra id, bypassing the registry.
func (p *CubeProvider) Refresh(cube string) (*types.Cube, error) {
	ccID := p.cubeCobraID(cube)
	if ccID == "" {
		return nil, fmt.Errorf("cube %q has no CubeCobra id", cube)
	}
	c, err := FetchCube(ccBaseURL, ccID)
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	p.cache[cube] = c
	p.mu.Unlock()
	return c, nil
}

// Warm populates the cache for every registered cube. A cube it can't reach is
// logged and skipped so a CubeCobra outage doesn't stop the server from
// starting; the next request retries the fetch.
func (p *CubeProvider) Warm() {
	for _, c := range p.reg.List() {
		if c.CubeCobraID == "" {
			continue
		}
		if _, err := p.Refresh(c.ID); err != nil {
			logrus.WithError(err).WithField("cube", c.ID).Warn("Failed to warm cube from CubeCobra")
		}
	}
}

// cubeCobraID returns the cube's Cube Cobra id from the registry, or "" if the
// registry is missing or the cube has no id set.
func cubeCobraID(cube string) string {
	reg, err := cubes.Load("data/cubes.json")
	if err != nil {
		logrus.WithError(err).Debug("No cube registry; skipping Cube Cobra enrichment")
		return ""
	}
	meta, ok := reg.Get(cube)
	if !ok {
		return ""
	}
	return meta.CubeCobraID
}
