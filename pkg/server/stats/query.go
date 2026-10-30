package stats

import (
	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// newQuery builds the deck query the stats handlers read through, with the
// cube's resolved packages answering package: terms.
func newQuery(store storage.DeckStorage, src types.CubeSource) *deckquery.Query {
	return deckquery.New(store, src, func(cubeID string) ([]design.PackageCards, error) {
		return PackagesForCube(store, src, cubeID)
	})
}
