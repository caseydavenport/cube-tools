package stats

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/search"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// TestGlobalRulesParse compiles every condition in the shared rules file, so a
// condition that stops parsing fails here instead of quietly matching nothing.
func TestGlobalRulesParse(t *testing.T) {
	raw, err := os.ReadFile("../../../data/global/cube-rules.json")
	require.NoError(t, err)
	var config design.DesignMapConfig
	require.NoError(t, json.Unmarshal(raw, &config))
	require.NotEmpty(t, config.Groups)

	for _, g := range config.Groups {
		for _, cond := range g.Conditions {
			_, err := search.Compile(cond, search.TargetRules)
			require.NoError(t, err, "group %s", g.Name)
		}
	}
}

// TestBuildaroundShapesParse does the same for the built-in build-around
// shapes.
func TestBuildaroundShapesParse(t *testing.T) {
	for _, cond := range buildaroundShape {
		_, err := search.Compile(cond, search.TargetRules)
		require.NoError(t, err)
	}
}

// TestRuleConditionNoParse checks a condition that doesn't parse matches no
// card, rather than every card as an empty query would.
func TestRuleConditionNoParse(t *testing.T) {
	cards := map[string]types.Card{
		"Lightning Bolt": {Name: "Lightning Bolt", Types: []string{"Instant"}},
		"Grizzly Bears":  {Name: "Grizzly Bears", Types: []string{"Creature"}},
	}
	require.Empty(t, matchCards(cards, "!t:creature"))
	require.Equal(t, map[string]bool{"Lightning Bolt": true}, matchCards(cards, "-t:creature"))
}
