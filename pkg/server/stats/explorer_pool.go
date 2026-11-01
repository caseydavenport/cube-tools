package stats

import (
	"strings"
	"sync"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// skipLayouts are Scryfall layouts that aren't game cards a cube could hold.
var skipLayouts = map[string]bool{
	"token":              true,
	"double_faced_token": true,
	"art_series":         true,
	"emblem":             true,
	"planar":             true,
	"scheme":             true,
	"vanguard":           true,
}

// skipSetTypes are Scryfall set types whose cards aren't real game cards.
var skipSetTypes = map[string]bool{
	"funny":       true,
	"memorabilia": true,
}

// MaybeboardSource returns the card names on a cube's CubeCobra maybeboard.
// It returns cubes.ErrNoCubeCobra for a cube with no CubeCobra id.
type MaybeboardSource func(cube string) ([]string, error)

var (
	poolOnce sync.Once
	cardPool map[string]types.Card
)

// explorerPool is every Magic card the explorer can search, keyed by full
// name, built once from the loaded oracle data.
func explorerPool() map[string]types.Card {
	poolOnce.Do(func() {
		cardPool = poolFromOracle(types.OracleCards())
	})
	return cardPool
}

// poolFromOracle turns oracle cards into the explorer's card pool, leaving out
// joke and memorabilia sets, tokens and other layouts that aren't game cards.
func poolFromOracle(cards []types.OracleCard) map[string]types.Card {
	out := make(map[string]types.Card, len(cards))
	for _, o := range cards {
		if skipSetTypes[o.SetType] || skipLayouts[o.Layout] {
			continue
		}
		out[o.Name] = types.FromOracle(o)
	}
	return out
}

// maybeboardNames maps maybeboard names onto pool names. A name matches a
// pool card by its full name or by a "//" card's front face.
func maybeboardNames(names []string, pool map[string]types.Card) map[string]bool {
	wanted := make(map[string]bool, len(names))
	for _, n := range names {
		wanted[n] = true
	}
	out := make(map[string]bool)
	for name := range pool {
		front := strings.TrimSpace(strings.Split(name, "//")[0])
		if wanted[name] || wanted[front] {
			out[name] = true
		}
	}
	return out
}
