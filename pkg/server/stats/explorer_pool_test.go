package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestPoolFromOracle_SkipsJokesAndTokens(t *testing.T) {
	pool := poolFromOracle([]types.OracleCard{
		{Name: "Bear", TypeLine: "Creature — Bear", Layout: "normal"},
		{Name: "Joke Bear", TypeLine: "Creature — Bear", Layout: "normal", SetType: "funny"},
		{Name: "Bear Token", TypeLine: "Token Creature — Bear", Layout: "token"},
		{Name: "Bear Art", TypeLine: "Card", Layout: "art_series"},
		{Name: "Forest", TypeLine: "Basic Land — Forest", Layout: "normal"},
	})

	assert.Len(t, pool, 1)
	assert.Contains(t, pool, "Bear")
}

func TestMaybeboardNames_FrontFace(t *testing.T) {
	pool := map[string]types.Card{
		"Fire // Ice": {Name: "Fire // Ice"},
		"Bear":        {Name: "Bear"},
	}

	got := maybeboardNames([]string{"Fire", "Bear", "Nope"}, pool)

	assert.Equal(t, map[string]bool{
		"Fire // Ice": true,
		"Bear":        true,
	}, got)
}
