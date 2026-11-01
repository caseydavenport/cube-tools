package design

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWire_MissingKindIsPairs(t *testing.T) {
	var plain Wire
	require.NoError(t, json.Unmarshal([]byte(`{"sources":["A"],"targets":["B"]}`), &plain))
	assert.False(t, plain.IsEnables())

	var enables Wire
	require.NoError(t, json.Unmarshal([]byte(`{"kind":"enables","sources":["A"],"targets":["B"]}`), &enables))
	assert.True(t, enables.IsEnables())

	out, err := json.Marshal(Wire{Sources: []string{"A"}, Targets: []string{"B"}})
	require.NoError(t, err)
	assert.NotContains(t, string(out), "kind")
}
