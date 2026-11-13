package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDraftLogCard(t *testing.T) {
	log := &DraftLog{CardData: map[string]DraftCard{
		"c1": {ID: "c1", Name: "Lightning Bolt"},
	}}

	assert.Equal(t, "Lightning Bolt", log.Card("c1").Name)
	assert.Empty(t, log.Card("missing").Name, "an unknown card ID gives an empty card")
}
