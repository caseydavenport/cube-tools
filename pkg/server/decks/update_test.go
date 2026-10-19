package decks

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/storage/router"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/require"
)

// seededBackend returns a memory backend holding draft 1 of "testcube" with
// Alice (deck 1, player 1) and Bob (deck 2, player 2), who played each other
// in round 1. Joan Jett (player 3) has no deck.
func seededBackend() *memory.Backend {
	alice := &storage.Deck{}
	alice.PlayerID = 1
	alice.Metadata.DraftID = 1
	alice.Matches = []types.Match{{Opponent: "Bob", OpponentID: 2, Round: 1, Wins: 2}}
	bob := &storage.Deck{}
	bob.PlayerID = 2
	bob.Metadata.DraftID = 1
	bob.Matches = []types.Match{{Opponent: "Alice", OpponentID: 1, Round: 1, Losses: 2}}

	b := memory.New()
	b.SeedPlayers(players.Player{ID: 1, Name: "Alice"}, players.Player{ID: 2, Name: "Bob"}, players.Player{ID: 3, Name: "Joan Jett"})
	b.Seed("testcube", alice, bob)
	return b
}

// deckView decodes just the fields these tests check. The full deck's card
// lists don't round-trip through types.Deck, so a minimal struct sidesteps that.
type deckView struct {
	ID             int    `json:"id"`
	Player         string `json:"player"`
	MacroArchetype string `json:"macro_archetype"`
	Notes          string `json:"notes"`
}

type decksView struct {
	Decks []deckView `json:"decks"`
}

// newStore wraps a fresh seeded backend, which is also its player source.
func newStore() *storage.Store {
	b := seededBackend()
	return storage.NewStore(b, storage.WithPlayers(b))
}

func post(t *testing.T, h http.Handler, cube, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/"+cube+path, bytes.NewReader([]byte(body)))
	req.SetPathValue("cube", cube)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestUpdateDeckHandler_OK(t *testing.T) {
	store := newStore()
	body := `{"draft_id": 1, "id": 1, "macro_archetype": "control", "labels": ["removal"], "notes": "nice"}`
	rec := post(t, UpdateDeckHandler(store), "testcube", "/decks/update", body)
	require.Equal(t, http.StatusOK, rec.Code)

	var got deckView
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, 1, got.ID)
	require.Equal(t, "control", got.MacroArchetype)
	require.Equal(t, "nice", got.Notes)
}

func TestUpdateDeckHandler_NotesAbsentVsEmpty(t *testing.T) {
	store := newStore()
	h := UpdateDeckHandler(store)
	post(t, h, "testcube", "/decks/update", `{"draft_id": 1, "id": 1, "notes": "keep me"}`)

	rec := post(t, h, "testcube", "/decks/update", `{"draft_id": 1, "id": 1, "labels": ["x"]}`)
	var got deckView
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, "keep me", got.Notes)

	rec = post(t, h, "testcube", "/decks/update", `{"draft_id": 1, "id": 1, "notes": ""}`)
	var cleared deckView
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &cleared))
	require.Equal(t, "", cleared.Notes)
}

func TestUpdateDeckHandler_NotFound(t *testing.T) {
	store := newStore()
	rec := post(t, UpdateDeckHandler(store), "testcube", "/decks/update", `{"draft_id": 1, "id": 9}`)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestUpdateDeckHandler_BadRequest(t *testing.T) {
	store := newStore()
	h := UpdateDeckHandler(store)
	require.Equal(t, http.StatusBadRequest, post(t, h, "testcube", "/decks/update", `{"id": 1}`).Code)
	require.Equal(t, http.StatusBadRequest, post(t, h, "testcube", "/decks/update", `{"draft_id": 1}`).Code)
	require.Equal(t, http.StatusBadRequest, post(t, h, "testcube", "/decks/update", `{not json`).Code)
}

func TestUpdateDeckRecordHandler_AssignPlayer(t *testing.T) {
	rec := post(t, UpdateDeckRecordHandler(newStore()), "testcube", "/decks/record", `{"draft_id": 1, "id": 1, "player_id": 3}`)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp decksView
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Decks, 1)
	require.Equal(t, "Joan Jett", resp.Decks[0].Player)
}

func TestUpdateDeckRecordHandler_PlayerTaken(t *testing.T) {
	rec := post(t, UpdateDeckRecordHandler(newStore()), "testcube", "/decks/record", `{"draft_id": 1, "id": 1, "player_id": 2}`)
	require.Equal(t, http.StatusConflict, rec.Code)
}

func TestUpdateDeckRecordHandler_UnknownPlayer(t *testing.T) {
	rec := post(t, UpdateDeckRecordHandler(newStore()), "testcube", "/decks/record", `{"draft_id": 1, "id": 1, "player_id": 99}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestUpdateDeckRecordHandler_NotFound(t *testing.T) {
	store := newStore()
	rec := post(t, UpdateDeckRecordHandler(store), "testcube", "/decks/record", `{"draft_id": 1, "id": 9}`)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestUpdateDeckRecordHandler_BadRequest(t *testing.T) {
	store := newStore()
	h := UpdateDeckRecordHandler(store)
	require.Equal(t, http.StatusBadRequest, post(t, h, "testcube", "/decks/record", `{"id": 1}`).Code)
	require.Equal(t, http.StatusBadRequest, post(t, h, "testcube", "/decks/record", `{"draft_id": 1, "id": 0}`).Code)
	require.Equal(t, http.StatusBadRequest, post(t, h, "testcube", "/decks/record", `{not json`).Code)
}

func TestWritesToCubeCobraCubeAreForbidden(t *testing.T) {
	store := storage.NewStore(router.New(seededBackend(), nil))
	rec := post(t, UpdateDeckHandler(store), "cc:polyversal", "/decks/update", `{"draft_id": 1, "id": 1}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
	rec = post(t, UpdateDeckRecordHandler(store), "cc:polyversal", "/decks/record", `{"draft_id": 1, "id": 1, "player_id": 3}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
}
