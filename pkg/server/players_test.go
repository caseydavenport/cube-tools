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

// playersMux serves the three player routes over ps.
func playersMux(ps PlayerStore) *http.ServeMux {
	mux := http.NewServeMux()
	mux.Handle("GET /api/players", PlayersListHandler(ps))
	mux.Handle("POST /api/players", PlayerAddHandler(ps))
	mux.Handle("PATCH /api/players/{id}", PlayerRenameHandler(ps))
	return mux
}

// fileStore returns a Store over an empty memory backend whose players live in
// players.json under root.
func fileStore(root string, opts ...storage.StoreOption) *storage.Store {
	opts = append(opts, storage.WithPlayers(players.FileSource{DataRoot: root}))
	return storage.NewStore(memory.New(), opts...)
}

// call sends one request through mux and returns the recorded response.
func call(mux *http.ServeMux, method, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(method, path, bytes.NewBufferString(body)))
	return rec
}

func TestPlayersAPI(t *testing.T) {
	mux := playersMux(fileStore(t.TempDir()))

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
	assert.Equal(t, http.StatusBadRequest, call(mux, http.MethodPatch, "/api/players/1", `{}`).Code)

	rec = call(mux, http.MethodPatch, "/api/players/1", `{"group": " The Crew "}`)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"id": 1, "name": "Joan Marie Larkin", "group": "The Crew"}`, rec.Body.String())
	assert.Equal(t, http.StatusNotFound, call(mux, http.MethodPatch, "/api/players/9", `{"group": "The Crew"}`).Code)
}

func TestGroupChangeReachesDecks(t *testing.T) {
	root := t.TempDir()
	_, err := players.Add(root, "Freddie")
	require.NoError(t, err)

	b := memory.New()
	d := &storage.Deck{}
	d.PlayerID = 1
	d.Metadata.DraftID = 1
	d.Date = "2026-01-10"
	anon := &storage.Deck{}
	anon.ID = 2
	anon.Metadata.DraftID = 1
	anon.Date = "2026-01-10"
	b.Seed("c", d, anon)
	store := storage.NewStore(b, storage.WithPlayers(players.FileSource{DataRoot: root}))

	before, err := store.List("c", nil)
	require.NoError(t, err)
	require.Equal(t, players.NoGroup, before[0].PlayGroup)

	rec := call(playersMux(store), http.MethodPatch, "/api/players/1", `{"group": "The Crew"}`)
	require.Equal(t, http.StatusOK, rec.Code)

	after, err := store.List("c", &storage.DecksRequest{Match: "playgroup:\"the crew\""})
	require.NoError(t, err)
	require.Len(t, after, 1)
	assert.Equal(t, "Freddie", after[0].Player)
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

	rec := call(playersMux(store), http.MethodPatch, "/api/players/1", `{"name": "Freddie Mercury"}`)
	require.Equal(t, http.StatusOK, rec.Code)

	after, err := store.List("c", nil)
	require.NoError(t, err)
	assert.Equal(t, "Freddie Mercury", after[0].Player)
}

func TestReadOnlyStoreRefusesPlayerEdits(t *testing.T) {
	root := t.TempDir()
	_, err := players.Add(root, "Freddie")
	require.NoError(t, err)

	writable := playersMux(fileStore(root))
	require.Equal(t, http.StatusOK, call(writable, http.MethodPatch, "/api/players/1", `{"name": "Freddie Mercury"}`).Code)

	readOnly := playersMux(fileStore(root, storage.WithReadOnly()))
	assert.Equal(t, http.StatusOK, call(readOnly, http.MethodGet, "/api/players", "").Code)
	assert.Equal(t, http.StatusForbidden, call(readOnly, http.MethodPost, "/api/players", `{"name": "Ozzy"}`).Code)
	assert.Equal(t, http.StatusForbidden, call(readOnly, http.MethodPatch, "/api/players/1", `{"name": "Freddie"}`).Code)
	assert.Equal(t, http.StatusForbidden, call(readOnly, http.MethodPatch, "/api/players/1", `{"group": "The Crew"}`).Code)

	l, err := players.Load(root)
	require.NoError(t, err)
	assert.Equal(t, []players.Player{{ID: 1, Name: "Freddie Mercury"}}, l.Players)
}
