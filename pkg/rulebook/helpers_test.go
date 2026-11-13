package rulebook

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// testCube is the cube id every test store seeds.
const testCube = "polyverse"

// fixedCubeSource serves one cube list as today's list.
type fixedCubeSource struct {
	cube *types.Cube
}

// Current returns the source's cube.
func (s fixedCubeSource) Current(string) (*types.Cube, error) {
	return s.cube, nil
}

// Refresh returns the source's cube.
func (s fixedCubeSource) Refresh(string) (*types.Cube, error) {
	return s.cube, nil
}

// load seeds a store with config and, when played names any cards, one deck
// playing them, then loads its rulebook over cube.
func load(t *testing.T, cube *types.Cube, config design.DesignMapConfig, played ...string) *Rulebook {
	t.Helper()
	store := memory.NewStore(func(b *memory.Backend) {
		b.SeedRules(testCube, &config)
		if len(played) > 0 {
			b.Seed(testCube, playDeck("Freddie", 1, 1, "2024-01-01", played...))
		}
	})
	rb, err := Load(store, fixedCubeSource{cube: cube}, testCube)
	require.NoError(t, err)
	return rb
}

// playDeck builds a deck from one draft playing the named cards.
func playDeck(player string, draftID, deckID int, date string, names ...string) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.PlayerID = 1
	d.ID = deckID
	d.Metadata.DraftID = draftID
	d.Date = date
	for _, n := range names {
		d.Mainboard = append(d.Mainboard, types.Card{Name: n, Types: []string{"Creature"}})
	}
	return d
}

// namedCards builds a cube list of plain creatures with the given names.
func namedCards(names ...string) *types.Cube {
	cube := &types.Cube{}
	for _, n := range names {
		cube.Cards = append(cube.Cards, types.Card{Name: n, Types: []string{"Creature"}})
	}
	return cube
}

// cardSet builds a set of card names.
func cardSet(names ...string) map[string]bool {
	out := make(map[string]bool, len(names))
	for _, n := range names {
		out[n] = true
	}
	return out
}

// deckCounts builds a deck's card counts: one copy per name.
func deckCounts(names ...string) design.CardCounts {
	out := design.CardCounts{}
	for _, n := range names {
		out[n]++
	}
	return out
}

// seedOracle loads oracle data holding only the given cards, so a cut card
// hydrates the same way on every run, and empties it again when the test ends.
func seedOracle(t *testing.T, cardsJSON string) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "oracle-cards.json")
	require.NoError(t, os.WriteFile(path, []byte(cardsJSON), 0o644))
	require.NoError(t, types.LoadOracleData(path))
	t.Cleanup(func() {
		empty := filepath.Join(dir, "empty.json")
		if err := os.WriteFile(empty, []byte("[]"), 0o644); err != nil {
			t.Logf("could not write empty oracle data: %v", err)
			return
		}
		if err := types.LoadOracleData(empty); err != nil {
			t.Logf("could not reset oracle data: %v", err)
		}
	})
}
