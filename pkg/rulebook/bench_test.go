package rulebook

import (
	"path/filepath"
	"slices"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/storage/file"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// latestSnapshot serves a cube's newest saved draft list as today's list.
type latestSnapshot struct{}

// Current returns the cube's newest draft list.
func (latestSnapshot) Current(cube string) (*types.Cube, error) {
	matches, err := filepath.Glob(filepath.Join("data", cube, "*", "cube-snapshot.json"))
	if err != nil || len(matches) == 0 {
		return nil, err
	}
	slices.Sort(matches)
	return types.LoadCube(matches[len(matches)-1])
}

// Refresh returns the cube's newest draft list.
func (s latestSnapshot) Refresh(cube string) (*types.Cube, error) {
	return s.Current(cube)
}

// BenchmarkResolveFresh resolves the real Polyverse rules from nothing, as
// the first request after a restart does: no remembered matches and no
// resolved packages.
func BenchmarkResolveFresh(b *testing.B) {
	b.Chdir("../..")
	require.NoError(b, types.LoadOracleData("data/oracle-cards.json"))
	require.NoError(b, types.LoadOracleTags("data/oracle-tags.jsonl"))
	loaded, err := Load(file.NewStore(latestSnapshot{}), latestSnapshot{}, "polyverse")
	require.NoError(b, err)

	b.ReportAllocs()
	for b.Loop() {
		groupMatches = newGroupMemo(groupMemoRuleSets)
		rb := &Rulebook{
			cubeID:        loaded.cubeID,
			cube:          loaded.cube,
			config:        loaded.config,
			decks:         loaded.decks,
			played:        loaded.played,
			deckCardNames: loaded.deckCardNames,
			lists:         loaded.lists,
			overrides:     loaded.overrides,
		}
		rb.Packages()
	}
}
