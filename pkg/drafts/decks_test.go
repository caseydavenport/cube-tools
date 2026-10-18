package drafts

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// deckIDs returns the IDs of decks, in order.
func deckIDs(decks []*types.Deck) []int {
	var out []int
	for _, d := range decks {
		out = append(out, d.ID)
	}
	return out
}

// deckFileNames returns the names of the deck files in dir, sorted.
func deckFileNames(t *testing.T, dir string) []string {
	t.Helper()
	paths, err := deckFiles(dir)
	require.NoError(t, err)
	var out []string
	for _, p := range paths {
		out = append(out, filepath.Base(p))
	}
	return out
}

func TestDecksSkipsNonDecks(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	writeDeck(t, filepath.Join(draft.Dir, "b.json"), 2)
	writeDeck(t, filepath.Join(draft.Dir, "a.json"), 1)
	for _, name := range []string{"metadata.json", "cube-snapshot.json", "draft-log.json", ".ocr-session.json"} {
		writeFile(t, filepath.Join(draft.Dir, name), "{}")
	}
	writeFile(t, filepath.Join(draft.Dir, "casey.report.md"), "notes")

	got, err := draft.Decks()
	require.NoError(t, err)
	assert.Equal(t, []int{1, 2}, deckIDs(got))
}

func TestDecksSetPathFromFile(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	writeFile(t, filepath.Join(draft.Dir, "stevie.json"), `{"id": 1, "metadata": {"path": "somewhere/else.json"}}`)

	got, err := draft.Decks()
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, filepath.Join(draft.Dir, "stevie.json"), got[0].Metadata.Path)
}

func TestDecksAreInNumericOrder(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	for id := 12; id >= 1; id-- {
		writeDeck(t, filepath.Join(draft.Dir, fmt.Sprintf("%d.json", id)), id)
	}

	got, err := draft.Decks()
	require.NoError(t, err)
	assert.Equal(t, []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}, deckIDs(got))
}

func TestNaturalLess(t *testing.T) {
	tests := []naturalLessCase{
		{"p2", "p10", true},
		{"p10", "p2", false},
		{"photo9.jpg", "photo10.jpg", true},
		{"IMG_0012.jpg", "IMG_0013.jpg", true},
		{"a", "b", true},
		{"b", "a", false},
		{"p3", "p3", false},
		{"10.json", "9.json", false},
		{"9.json", "alice.json", true},
	}
	for _, tc := range tests {
		assert.Equal(t, tc.want, NaturalLess(tc.a, tc.b), "%s < %s", tc.a, tc.b)
	}
}

// naturalLessCase is one row of TestNaturalLess.
type naturalLessCase struct {
	a, b string
	want bool
}

func TestNextDeckID(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	writeDeck(t, filepath.Join(draft.Dir, "a.json"), 1)
	writeDeck(t, filepath.Join(draft.Dir, "b.json"), 4)
	writeFile(t, filepath.Join(draft.Dir, "metadata.json"), `{"id": 99}`)

	got, err := draft.NextDeckID()
	require.NoError(t, err)
	assert.Equal(t, 5, got)
}

func TestNextDeckIDEmptyDir(t *testing.T) {
	got, err := Draft{Dir: t.TempDir()}.NextDeckID()
	require.NoError(t, err)
	assert.Equal(t, 1, got)

	got, err = Draft{Dir: filepath.Join(t.TempDir(), "missing")}.NextDeckID()
	require.NoError(t, err)
	assert.Equal(t, 1, got)
}

func TestNextDeckIDBadDeckFile(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	writeFile(t, filepath.Join(draft.Dir, "broken.json"), "{not json")

	_, err := draft.NextDeckID()
	assert.ErrorContains(t, err, "broken.json")
}

func TestDeckByID(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	writeDeck(t, filepath.Join(draft.Dir, "5.json"), 5)
	writeDeck(t, filepath.Join(draft.Dir, "casey.json"), 2)

	d, err := draft.Deck(2)
	require.NoError(t, err)
	assert.Equal(t, 2, d.ID)

	_, err = draft.Deck(9)
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestDeckByPlayer(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	d := types.NewDeck()
	d.ID = 4
	d.PlayerID = 7
	require.NoError(t, d.Save(filepath.Join(draft.Dir, "4.json")))

	got, err := draft.DeckByPlayer(7)
	require.NoError(t, err)
	assert.Equal(t, 4, got.ID)

	_, err = draft.DeckByPlayer(8)
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = draft.DeckByPlayer(0)
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestSaveDeckOverwritesFileHoldingID(t *testing.T) {
	draft := Draft{Dir: t.TempDir(), DraftMetadata: types.DraftMetadata{ID: 3}}
	writeDeck(t, filepath.Join(draft.Dir, "freddie.json"), 1)

	d := types.NewDeck()
	d.ID = 1
	d.Notes = "Bohemian"
	require.NoError(t, draft.SaveDeck(d))

	assert.Equal(t, []string{"freddie.json"}, deckFileNames(t, draft.Dir))
	assert.Equal(t, filepath.Join(draft.Dir, "freddie.json"), d.Metadata.Path)
	got, err := draft.Deck(1)
	require.NoError(t, err)
	assert.Equal(t, "Bohemian", got.Notes)
}

func TestSaveDeckNewDeckUsesIDName(t *testing.T) {
	draft := Draft{Dir: t.TempDir(), DraftMetadata: types.DraftMetadata{ID: 6}}

	d := types.NewDeck()
	d.ID = 3
	require.NoError(t, draft.SaveDeck(d))

	assert.Equal(t, []string{"3.json"}, deckFileNames(t, draft.Dir))
	assert.Equal(t, 6, d.Metadata.DraftID)
	assert.Equal(t, filepath.Join(draft.Dir, "3.json"), d.Metadata.Path)
}

func TestSaveDeckRefusesDuplicateIDs(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	writeDeck(t, filepath.Join(draft.Dir, "a.json"), 2)
	writeDeck(t, filepath.Join(draft.Dir, "b.json"), 2)
	before, err := os.ReadFile(filepath.Join(draft.Dir, "a.json"))
	require.NoError(t, err)

	d := types.NewDeck()
	d.ID = 2
	d.Notes = "Paranoid"
	err = draft.SaveDeck(d)
	assert.ErrorContains(t, err, "a.json")
	assert.ErrorContains(t, err, "b.json")

	after, err := os.ReadFile(filepath.Join(draft.Dir, "a.json"))
	require.NoError(t, err)
	assert.Equal(t, before, after)
}

func TestSaveDeckRefusesFileWithoutID(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	writeDeck(t, filepath.Join(draft.Dir, "a.json"), 0)

	d := types.NewDeck()
	d.ID = 1
	assert.ErrorContains(t, draft.SaveDeck(d), "a.json")
}

func TestCheckDeckIDs(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	writeDeck(t, filepath.Join(draft.Dir, "a.json"), 1)
	writeDeck(t, filepath.Join(draft.Dir, "b.json"), 2)
	assert.NoError(t, draft.CheckDeckIDs())

	writeDeck(t, filepath.Join(draft.Dir, "c.json"), 2)
	err := draft.CheckDeckIDs()
	assert.ErrorContains(t, err, "b.json")
	assert.ErrorContains(t, err, "c.json")
}

func TestSaveDeckRequiresID(t *testing.T) {
	assert.Error(t, Draft{Dir: t.TempDir()}.SaveDeck(types.NewDeck()))
}
