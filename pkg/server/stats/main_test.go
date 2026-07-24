package stats

import (
	"fmt"
	"path/filepath"
	"sort"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// testCubeSource is a CubeSource that reads the newest on-disk snapshot, so the
// stats tests have a cube to work with without reaching Cube Cobra.
type testCubeSource struct{}

func (testCubeSource) Current(cube string) (*types.Cube, error) { return snapshotLoader(cube) }
func (testCubeSource) Refresh(cube string) (*types.Cube, error) { return snapshotLoader(cube) }

// snapshotLoader loads the lexically-latest snapshot for a cube. Tests run
// either from the package dir or after chdir'ing to the repo root, so we try
// both data roots.
func snapshotLoader(cube string) (*types.Cube, error) {
	// Draft directories carry date-plus-suffix names, so glob for any snapshot
	// under the cube and take the lexically-latest (newest date).
	for _, root := range []string{"data", "../../../data"} {
		matches, _ := filepath.Glob(filepath.Join(root, cube, "*", "cube-snapshot.json"))
		if len(matches) == 0 {
			continue
		}
		sort.Strings(matches)
		return types.LoadCube(matches[len(matches)-1])
	}
	return nil, fmt.Errorf("no snapshot for cube %q in test data", cube)
}
