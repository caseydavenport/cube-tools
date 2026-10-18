package stats

import (
	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// newQuery builds the deck query the stats handlers read through, with the
// cube's design graph as the source of community: edges.
func newQuery(store storage.DeckStorage, src types.CubeSource) *deckquery.Query {
	return deckquery.New(store, src, func(cubeID string) ([]graph.Edge, error) {
		return EdgesForCube(store, src, cubeID)
	})
}
