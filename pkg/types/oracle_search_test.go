package types

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedSearchOracle loads oracle data holding only the given cards, and empties
// it again when the test ends.
func seedSearchOracle(t *testing.T, cardsJSON string) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "oracle-cards.json")
	require.NoError(t, os.WriteFile(path, []byte(cardsJSON), 0o644))
	require.NoError(t, LoadOracleData(path))
	t.Cleanup(func() {
		empty := filepath.Join(dir, "empty.json")
		if err := os.WriteFile(empty, []byte("[]"), 0o644); err != nil {
			t.Logf("could not write empty oracle data: %v", err)
			return
		}
		if err := LoadOracleData(empty); err != nil {
			t.Logf("could not reset oracle data: %v", err)
		}
	})
}

func TestSearchOracleNames_PrefixFirst(t *testing.T) {
	seedSearchOracle(t, `[
		{"name":"Lightning Bolt","type_line":"Instant"},
		{"name":"Bolt Bend","type_line":"Instant"},
		{"name":"Fire // Ice","type_line":"Instant // Instant"},
		{"name":"Shock","type_line":"Instant"}
	]`)

	assert.Equal(t, []string{"Bolt Bend", "Lightning Bolt"}, SearchOracleNames("bolt", 10))
	assert.Equal(t, []string{"Bolt Bend"}, SearchOracleNames("bolt", 1))

	// A split card is found once, by its full name, even though its front face
	// is indexed too.
	assert.Equal(t, []string{"Fire // Ice"}, SearchOracleNames("fire", 10))
	assert.Equal(t, []string{}, SearchOracleNames("nothing", 10))
}
