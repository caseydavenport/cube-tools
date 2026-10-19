package decks

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// summaryCase is one deck seeded into a cube and the summary it should produce.
type summaryCase struct {
	name string
	deck *storage.Deck
	want DeckSummary
}

// summaryDeck builds a deck in draft 3 with the given mainboard.
func summaryDeck(player string, mainboard ...types.Card) *storage.Deck {
	d := &storage.Deck{}
	d.ID = 1
	d.Player = player
	d.Metadata.DraftID = 3
	d.Date = "2024-01-01"
	d.Mainboard = mainboard
	return d
}

// getSummary serves GET /api/testcube/decks/summary from a store seeded with
// decks and with player 7, Ozzy, in the player list.
func getSummary(t *testing.T, decks ...*storage.Deck) (*httptest.ResponseRecorder, SummaryResponse) {
	t.Helper()
	store := memory.NewStore(func(b *memory.Backend) {
		b.SeedPlayers(players.Player{ID: 7, Name: "Ozzy"})
		b.Seed("testcube", decks...)
	})
	req := httptest.NewRequest(http.MethodGet, "/api/testcube/decks/summary", nil)
	req.SetPathValue("cube", "testcube")
	rec := httptest.NewRecorder()
	SummaryHandler(store).ServeHTTP(rec, req)

	var resp SummaryResponse
	if rec.Code == http.StatusOK {
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	}
	return rec, resp
}

func TestSummaryHandlerSummarizesEachDeck(t *testing.T) {
	won := summaryDeck("Ozzy", types.Card{Name: "Llanowar Elves", Colors: []string{"G"}}, types.Card{Name: "Doom Blade", Colors: []string{"B"}})
	won.PlayerID = 7
	won.Matches = []types.Match{
		{Opponent: "Joan", Round: 1, Wins: 2, Losses: 0},
		{Opponent: "Stevie", Round: 2, Wins: 2, Losses: 1},
		{Opponent: "Freddie", Round: 3, Wins: 2, Losses: 0},
	}

	overridden := summaryDeck("Joan", types.Card{Name: "Llanowar Elves", Colors: []string{"G"}})
	overridden.Colors = []string{"U", "W"}

	seat := summaryDeck("p4")
	seat.Seat = 4

	cases := []summaryCase{
		{
			name: "colors inferred from the mainboard, in WUBRG order, with match stats",
			deck: won,
			want: DeckSummary{
				ID: 1, Metadata: SummaryMetadata{DraftID: 3}, Player: "Ozzy", PlayerID: 7,
				Colors: []string{"B", "G"},
				Stats:  SummaryStats{MatchWins: 3, MatchLosses: 0, MatchDraws: 0, Trophies: 1},
			},
		},
		{
			name: "explicit colors win over the mainboard",
			deck: overridden,
			want: DeckSummary{
				ID: 1, Metadata: SummaryMetadata{DraftID: 3}, Player: "Joan",
				Colors: []string{"W", "U"},
			},
		},
		{
			name: "an anonymous seat keeps its seat number and has no colors",
			deck: seat,
			want: DeckSummary{
				ID: 1, Metadata: SummaryMetadata{DraftID: 3}, Player: "p4", Seat: 4,
				Colors: []string{},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec, resp := getSummary(t, tc.deck)
			assert.Equal(t, http.StatusOK, rec.Code)
			require.Len(t, resp.Decks, 1)
			assert.Equal(t, tc.want, resp.Decks[0])
		})
	}
}

func TestSummaryHandlerEmptyCubeSendsEmptyList(t *testing.T) {
	rec, _ := getSummary(t)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"decks":[]}`, rec.Body.String())
}

func TestSummaryHandlerStoreErrorIs500(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/testcube/decks/summary", nil)
	req.SetPathValue("cube", "testcube")
	rec := httptest.NewRecorder()
	SummaryHandler(failingStore{}).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}
