package rulebook

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/search"
)

// TestBuildaroundShapesParse does the same for the built-in build-around
// shapes.
func TestBuildaroundShapesParse(t *testing.T) {
	for _, cond := range buildaroundShape {
		_, err := search.Compile(cond, search.TargetRules)
		require.NoError(t, err)
	}
}
