package rulebook

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/search"
)

// TestBuildaroundShapesParse checks every built-in build-around shape
// compiles.
func TestBuildaroundShapesParse(t *testing.T) {
	for _, cond := range buildaroundShape {
		_, err := search.Compile(cond, search.TargetRules)
		require.NoError(t, err)
	}
}
