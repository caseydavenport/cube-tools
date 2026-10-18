package commands

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// newDraft creates draft 1 of cube "polyverse" under a fresh working directory.
func newDraft(t *testing.T) drafts.Draft {
	t.Helper()
	t.Chdir(t.TempDir())
	draft, err := drafts.Create(filepath.Join("data", "polyverse"), types.DraftMetadata{Date: "2026-01-02"})
	require.NoError(t, err)
	return draft
}

func TestWriteDeckKeepsExistingIDAndNotes(t *testing.T) {
	draft := newDraft(t)
	existing := types.NewDeck()
	existing.ID = 7
	existing.PlayerID = 5
	existing.Seat = 4
	existing.Notes = "keep me"
	path := filepath.Join(draft.Dir, "casey.json")
	require.NoError(t, existing.Save(path))

	d := types.NewDeck()
	d.PlayerID = 5
	require.NoError(t, writeDeck(d, draft))

	got, err := types.LoadDeck(path)
	require.NoError(t, err)
	require.Equal(t, 7, got.ID)
	require.Equal(t, "keep me", got.Notes)
	require.Equal(t, 4, got.Seat)
	require.Equal(t, 1, got.Metadata.DraftID)
}

func TestWriteDeckNewDeckGetsNextIDFile(t *testing.T) {
	draft := newDraft(t)
	for _, player := range []int{1, 2, 3} {
		d := types.NewDeck()
		d.PlayerID = player
		require.NoError(t, writeDeck(d, draft))
	}

	got, err := draft.Deck(3)
	require.NoError(t, err)
	require.Equal(t, 3, got.ID)
	require.Equal(t, 3, got.PlayerID)
	require.Equal(t, filepath.Join(draft.Dir, "3.json"), got.Metadata.Path)
}

func TestParseBadDeckLeavesNoDraft(t *testing.T) {
	t.Chdir(t.TempDir())
	date, draftID = "2026-01-02", 0
	defer func() { date = "" }()

	err := parseOne("polyverse", "deck.pdf", "freddie", "")
	require.Error(t, err)
	all, err := drafts.List(filepath.Join("data", "polyverse"))
	require.NoError(t, err)
	require.Empty(t, all)
}

// seedPlayers writes data/players.json with Freddie (1), Ozzy (2) and Joan
// Jett (3) in the current working directory.
func seedPlayers(t *testing.T) {
	t.Helper()
	for _, name := range []string{"Freddie Mercury", "Ozzy Osbourne", "Joan Jett"} {
		_, err := players.Add("data", name)
		require.NoError(t, err)
	}
}

// oracleMini is the test oracle data, resolved before tests change directory.
var oracleMini = absPath("testdata/oracle-mini.json")

// absPath resolves path against the package directory, panicking if it can't.
func absPath(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		panic(err)
	}
	return abs
}

// writeDeckList writes a small deck list, with a sideboard, and returns its
// path.
func writeDeckList(t *testing.T) string {
	t.Helper()
	require.NoError(t, types.LoadOracleData(oracleMini))
	path := filepath.Join(t.TempDir(), "deck.txt")
	require.NoError(t, os.WriteFile(path, []byte("1 Monastery Mentor\n1 Plains\n\n1 Snapcaster Mage\n"), 0o644))
	return path
}

func TestParseUnknownPlayerFails(t *testing.T) {
	t.Chdir(t.TempDir())
	seedPlayers(t)
	date, draftID = "2026-01-02", 0
	defer func() { date = "" }()

	err := parseOne("polyverse", writeDeckList(t), "Stevie Nicks", "")
	require.ErrorContains(t, err, `players add "Stevie Nicks"`)
	all, err := drafts.List(filepath.Join("data", "polyverse"))
	require.NoError(t, err)
	require.Empty(t, all)
}

func TestParseByNameWritesPlayerID(t *testing.T) {
	t.Chdir(t.TempDir())
	seedPlayers(t)
	date, draftID = "2026-01-02", 0
	defer func() { date = "" }()

	require.NoError(t, parseOne("polyverse", writeDeckList(t), "joan jett", ""))
	raw, err := os.ReadFile(filepath.Join("data", "polyverse", "0001_2026-01-02", "1.json"))
	require.NoError(t, err)
	var onDisk map[string]any
	require.NoError(t, json.Unmarshal(raw, &onDisk))
	require.EqualValues(t, 3, onDisk["player_id"])
	require.NotContains(t, onDisk, "player")
}

func TestParseAnonymousWritesNoPlayer(t *testing.T) {
	t.Chdir(t.TempDir())
	date, draftID, anon = "2026-01-02", 0, true
	defer func() { date, anon = "", false }()

	require.NoError(t, parseOne("polyverse", writeDeckList(t), "", ""))
	got, err := types.LoadDeck(filepath.Join("data", "polyverse", "0001_2026-01-02", "1.json"))
	require.NoError(t, err)
	require.Equal(t, 0, got.PlayerID)
	require.Equal(t, 1, got.Seat)
}

func TestAnonymousParseIntoDraftWithSeatsNeedsForce(t *testing.T) {
	draft := newDraft(t)
	require.NoError(t, checkAnonymousRerun(draft))

	seat := types.NewDeck()
	seat.ID = 1
	require.NoError(t, draft.SaveDeck(seat))
	require.ErrorContains(t, checkAnonymousRerun(draft), "--force")

	force = true
	defer func() { force = false }()
	require.NoError(t, checkAnonymousRerun(draft))
}
