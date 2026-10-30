package decks

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// similarDeck builds a deck in the given draft whose mainboard holds the named
// spells.
func similarDeck(draftID, id int, date string, spells ...string) *storage.Deck {
	d := &storage.Deck{}
	d.ID = id
	d.Player = fmt.Sprintf("player%d-%d", draftID, id)
	d.Metadata.DraftID = draftID
	d.Date = date
	for _, name := range spells {
		d.Mainboard = append(d.Mainboard, types.Card{Name: name, Types: []string{"Instant"}})
	}
	return d
}

// spells returns n spell names starting at index from: spells(0, 3) is
// card0, card1, card2.
func spells(from, n int) []string {
	var out []string
	for i := from; i < from+n; i++ {
		out = append(out, fmt.Sprintf("card%d", i))
	}
	return out
}

// sharedCounts lists each result's shared-card count, in order.
func sharedCounts(rows []SimilarDeck) []int {
	var out []int
	for _, r := range rows {
		out = append(out, r.Shared)
	}
	return out
}

func TestSimilarDecks_SharedCardsFirst(t *testing.T) {
	target := similarDeck(1, 1, "2024-01-01", spells(0, 20)...)
	all := []*storage.Deck{
		target,
		similarDeck(2, 1, "2024-02-01", spells(0, 12)...),
		similarDeck(2, 2, "2024-02-01", spells(0, 9)...),
		similarDeck(2, 3, "2024-02-01", spells(0, 10)...),
	}
	assert.Equal(t, []int{12, 10, 9}, sharedCounts(similarDecks(target, all, 5)))
}

func TestSimilarDecks_ExcludesSelf(t *testing.T) {
	target := similarDeck(1, 1, "2024-01-01", spells(0, 20)...)
	for _, row := range similarDecks(target, []*storage.Deck{target}, 5) {
		assert.False(t, row.DraftID == 1 && row.ID == 1)
	}
}

func TestSimilarDecks_IgnoresBasics(t *testing.T) {
	mountains := make([]types.Card, 20)
	for i := range mountains {
		mountains[i] = types.Card{Name: "Mountain", Types: []string{"Basic", "Land"}}
	}
	target := similarDeck(1, 1, "2024-01-01", spells(0, 7)...)
	target.Mainboard = append(target.Mainboard, mountains...)
	other := similarDeck(2, 1, "2024-02-01", spells(0, 7)...)
	other.Mainboard = append(other.Mainboard, mountains...)

	assert.Empty(t, similarDecks(target, []*storage.Deck{target, other}, 5))
}

func TestSimilarDecks_NoneAboveMinimum(t *testing.T) {
	target := similarDeck(1, 1, "2024-01-01", spells(0, 20)...)
	other := similarDeck(2, 1, "2024-02-01", spells(0, 7)...)

	rows := similarDecks(target, []*storage.Deck{target, other}, 5)
	assert.NotNil(t, rows)
	assert.Empty(t, rows)
}

func TestSimilarDecks_TieBreaksByDate(t *testing.T) {
	target := similarDeck(1, 1, "2024-01-01", spells(0, 20)...)
	older := similarDeck(2, 1, "2024-02-01", spells(0, 9)...)
	newer := similarDeck(3, 1, "2024-03-01", spells(0, 9)...)

	rows := similarDecks(target, []*storage.Deck{target, older, newer}, 5)
	require.Len(t, rows, 2)
	assert.Equal(t, 3, rows[0].DraftID)
	assert.Equal(t, 2, rows[1].DraftID)
}

func TestSimilarDecks_Limit(t *testing.T) {
	target := similarDeck(1, 1, "2024-01-01", spells(0, 20)...)
	all := []*storage.Deck{target}
	for i := 1; i <= 7; i++ {
		all = append(all, similarDeck(2, i, "2024-02-01", spells(0, 10)...))
	}
	assert.Len(t, similarDecks(target, all, 5), 5)
}

func TestSimilarDecksHandler_UnknownDeck(t *testing.T) {
	store := memory.NewStore(func(b *memory.Backend) {
		b.Seed("testcube", similarDeck(1, 1, "2024-01-01", spells(0, 20)...))
	})
	req := httptest.NewRequest(http.MethodGet, "/api/testcube/decks/similar?deck=999/1", nil)
	req.SetPathValue("cube", "testcube")
	rec := httptest.NewRecorder()
	SimilarDecksHandler(store).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSimilarDecksHandler_MalformedDeck(t *testing.T) {
	store := memory.NewStore(func(b *memory.Backend) {
		b.Seed("testcube", similarDeck(1, 1, "2024-01-01", spells(0, 20)...))
	})
	req := httptest.NewRequest(http.MethodGet, "/api/testcube/decks/similar?deck=nope", nil)
	req.SetPathValue("cube", "testcube")
	rec := httptest.NewRecorder()
	SimilarDecksHandler(store).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}
