package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/require"
)

// seedCube writes a minimal data/<cube>/ tree (index.json + one deck file) into
// the current working directory and returns the deck's repo-relative path.
func seedCube(t *testing.T, cube, draftID, player string, deck *types.Deck) string {
	t.Helper()
	deckPath := filepath.Join("data", cube, draftID, draftID+"-"+player+".json")
	require.NoError(t, os.MkdirAll(filepath.Dir(deckPath), 0o755))

	deck.Player = player
	deck.Metadata.DraftID = draftID
	deck.Metadata.Path = deckPath
	require.NoError(t, deck.Save(deckPath))

	idx := commands.MainIndex{Drafts: []commands.Draft{{
		DraftID: draftID,
		Decks:   []commands.IndexedDeck{{Path: deckPath}},
	}}}
	b, _ := json.Marshal(idx)
	require.NoError(t, os.WriteFile(filepath.Join("data", cube, "index.json"), b, 0o644))
	return deckPath
}

func chdirTemp(t *testing.T) {
	t.Helper()
	cwd, _ := os.Getwd()
	t.Cleanup(func() { _ = os.Chdir(cwd) })
	require.NoError(t, os.Chdir(t.TempDir()))
}

func TestUpdateDeckMeta(t *testing.T) {
	chdirTemp(t)
	deckPath := seedCube(t, "testcube", "2025-01-01_d1", "p1", &types.Deck{
		Mainboard: []types.Card{{Name: "Wrath of God"}},
		Colors:    []string{"W"},
	})

	s := NewFileDeckStoreWithCache()
	updated, err := s.UpdateDeckMeta("testcube", "2025-01-01_d1", "p1",
		"control", []string{"removal", "wraths"}, []string{"W", "U"})
	require.NoError(t, err)
	require.Equal(t, "control", updated.MacroArchetype)
	require.Equal(t, []string{"removal", "wraths"}, updated.Labels)
	require.Equal(t, []string{"W", "U"}, updated.Colors)

	// On disk: fields rewritten, mainboard preserved.
	reloaded, err := types.LoadDeck(deckPath)
	require.NoError(t, err)
	require.Equal(t, "control", reloaded.MacroArchetype)
	require.Equal(t, []string{"removal", "wraths"}, reloaded.Labels)
	require.Equal(t, []string{"W", "U"}, reloaded.Colors)
	require.Len(t, reloaded.Mainboard, 1)
	require.Equal(t, "Wrath of God", reloaded.Mainboard[0].Name)
}

func TestUpdateDeckMeta_ClearsColorOverride(t *testing.T) {
	chdirTemp(t)
	deckPath := seedCube(t, "testcube", "2025-01-01_d1", "p1", &types.Deck{
		Mainboard: []types.Card{{Name: "Wrath of God"}},
		Colors:    []string{"W"},
	})

	s := NewFileDeckStoreWithCache()
	_, err := s.UpdateDeckMeta("testcube", "2025-01-01_d1", "p1", "", nil, []string{})
	require.NoError(t, err)

	// colors is omitempty - an empty override drops the key entirely on disk.
	raw, err := os.ReadFile(deckPath)
	require.NoError(t, err)
	var onDisk map[string]any
	require.NoError(t, json.Unmarshal(raw, &onDisk))
	_, present := onDisk["colors"]
	require.False(t, present, "cleared color override should be absent on disk")
}

func TestUpdateDeckMeta_UnknownDeck(t *testing.T) {
	chdirTemp(t)
	seedCube(t, "testcube", "2025-01-01_d1", "p1", &types.Deck{
		Mainboard: []types.Card{{Name: "Wrath of God"}},
	})

	s := NewFileDeckStoreWithCache()
	_, err := s.UpdateDeckMeta("testcube", "2025-01-01_d1", "nobody", "control", nil, nil)
	require.ErrorIs(t, err, ErrDeckNotFound)
}
