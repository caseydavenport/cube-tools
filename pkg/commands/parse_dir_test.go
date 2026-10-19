package commands

import (
	"fmt"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
)

// singletonCube holds n singleton cards, "Card 1" through "Card n".
func singletonCube(n int) *types.Cube {
	c := &types.Cube{}
	for i := 1; i <= n; i++ {
		c.Cards = append(c.Cards, types.Card{Name: fmt.Sprintf("Card %d", i)})
	}
	return c
}

// seenCards is "Card 1" through "Card n", once each.
func seenCards(n int) []types.CountedCard {
	var out []types.CountedCard
	for i := 1; i <= n; i++ {
		out = append(out, types.CountedCard{Name: fmt.Sprintf("Card %d", i), Count: 1})
	}
	return out
}

func TestCheckDraftConsistencyShortDraftPasses(t *testing.T) {
	logc := logrus.WithField("test", t.Name())
	assert.NoError(t, checkDraftConsistency(logc, singletonCube(24), seenCards(12)))
}

func TestCheckDraftConsistencyOverFails(t *testing.T) {
	logc := logrus.WithField("test", t.Name())
	seen := append(seenCards(12), types.CountedCard{Name: "Card 1", Count: 1})
	assert.Error(t, checkDraftConsistency(logc, singletonCube(24), seen))
}

func TestCheckDraftConsistencyIgnoresCase(t *testing.T) {
	logc := logrus.WithField("test", t.Name())
	seen := []types.CountedCard{{Name: "card 1", Count: 1}, {Name: "CARD 2", Count: 1}}
	assert.NoError(t, checkDraftConsistency(logc, singletonCube(2), seen))
}
