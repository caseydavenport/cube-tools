package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
)

// nopInvalidator satisfies PlayerInvalidator for tests without a Store.
type nopInvalidator struct{}

// InvalidatePlayers does nothing.
func (nopInvalidator) InvalidatePlayers() {}

// playersMux serves the three player routes over dataRoot.
func playersMux(dataRoot string, inv PlayerInvalidator) *http.ServeMux {
	mux := http.NewServeMux()
	mux.Handle("GET /api/players", PlayersListHandler(dataRoot))
	mux.Handle("POST /api/players", PlayerAddHandler(dataRoot))
	mux.Handle("PATCH /api/players/{id}", PlayerRenameHandler(dataRoot, inv))
	return mux
}

// call sends one request through mux and returns the recorded response.
func call(mux *http.ServeMux, method, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(method, path, bytes.NewBufferString(body)))
	return rec
}

func TestPlayersAPI(t *testing.T) {
	mux := playersMux(t.TempDir(), nopInvalidator{})

	rec := call(mux, http.MethodPost, "/api/players", `{"name": " Joan Jett "}`)
	require.Equal(t, http.StatusCreated, rec.Code)
	var joan players.Player
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &joan))
	assert.Equal(t, players.Player{ID: 1, Name: "Joan Jett"}, joan)

	assert.Equal(t, http.StatusConflict, call(mux, http.MethodPost, "/api/players", `{"name": "joan jett"}`).Code)
	assert.Equal(t, http.StatusBadRequest, call(mux, http.MethodPost, "/api/players", `{"name": "p3"}`).Code)
	assert.Equal(t, http.StatusBadRequest, call(mux, http.MethodPost, "/api/players", `{not json`).Code)
	require.Equal(t, http.StatusCreated, call(mux, http.MethodPost, "/api/players", `{"name": "Stevie Nicks"}`).Code)

	rec = call(mux, http.MethodGet, "/api/players", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var list players.List
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &list))
	assert.Len(t, list.Players, 2)

	rec = call(mux, http.MethodPatch, "/api/players/1", `{"name": "Joan Marie Larkin"}`)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"id": 1, "name": "Joan Marie Larkin"}`, rec.Body.String())

	assert.Equal(t, http.StatusConflict, call(mux, http.MethodPatch, "/api/players/1", `{"name": "stevie nicks"}`).Code)
	assert.Equal(t, http.StatusBadRequest, call(mux, http.MethodPatch, "/api/players/1", `{"name": "42"}`).Code)
	assert.Equal(t, http.StatusNotFound, call(mux, http.MethodPatch, "/api/players/9", `{"name": "Ozzy"}`).Code)
	assert.Equal(t, http.StatusNotFound, call(mux, http.MethodPatch, "/api/players/abc", `{"name": "Ozzy"}`).Code)
}

func TestRenameInvalidatesDeckNames(t *testing.T) {
	root := t.TempDir()
	_, err := players.Add(root, "Freddie")
	require.NoError(t, err)

	b := memory.New()
	d := &storage.Deck{}
	d.PlayerID = 1
	d.Metadata.DraftID = 1
	b.Seed("c", d)
	store := storage.NewStore(b, storage.WithPlayers(players.FileSource{DataRoot: root}))

	before, err := store.List("c", nil)
	require.NoError(t, err)
	require.Equal(t, "Freddie", before[0].Player)

	rec := call(playersMux(root, store), http.MethodPatch, "/api/players/1", `{"name": "Freddie Mercury"}`)
	require.Equal(t, http.StatusOK, rec.Code)

	after, err := store.List("c", nil)
	require.NoError(t, err)
	assert.Equal(t, "Freddie Mercury", after[0].Player)
}
