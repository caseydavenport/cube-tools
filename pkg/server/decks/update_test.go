package decks

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/require"
)

func seedCube(t *testing.T, cube, draftID, player string) string {
	t.Helper()
	deckPath := filepath.Join("data", cube, draftID, draftID+"-"+player+".json")
	require.NoError(t, os.MkdirAll(filepath.Dir(deckPath), 0o755))
	d := types.NewDeck()
	d.Player = player
	d.Metadata.DraftID = draftID
	d.Metadata.Path = deckPath
	d.Mainboard = []types.Card{{Name: "Wrath of God"}}
	require.NoError(t, d.Save(deckPath))

	idx := commands.MainIndex{Drafts: []commands.Draft{{
		DraftID: draftID,
		Decks:   []commands.IndexedDeck{{Path: deckPath}},
	}}}
	b, _ := json.Marshal(idx)
	require.NoError(t, os.WriteFile(filepath.Join("data", cube, "index.json"), b, 0o644))
	return deckPath
}

func updateReq(t *testing.T, cube string, body UpdateDeckMetaRequest) *http.Request {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/"+cube+"/decks/update", bytes.NewReader(b))
	req.SetPathValue("cube", cube)
	return req
}

func TestUpdateDeckHandler_OK(t *testing.T) {
	cwd, _ := os.Getwd()
	t.Cleanup(func() { _ = os.Chdir(cwd) })
	require.NoError(t, os.Chdir(t.TempDir()))
	deckPath := seedCube(t, "testcube", "d1", "p1")

	store := storage.NewFileDeckStoreWithCache()
	rec := httptest.NewRecorder()
	UpdateDeckHandler(store).ServeHTTP(rec, updateReq(t, "testcube", UpdateDeckMetaRequest{
		DraftID: "d1", Player: "p1", MacroArchetype: "control",
		Labels: []string{"removal"}, Colors: []string{"W"},
	}))
	require.Equal(t, http.StatusOK, rec.Code)

	// Decode just the edited field. The full deck's card lists are objects on
	// the wire but strings on disk, so a minimal struct sidesteps the mismatch.
	var got struct {
		MacroArchetype string `json:"macro_archetype"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, "control", got.MacroArchetype)

	reloaded, err := types.LoadDeck(deckPath)
	require.NoError(t, err)
	require.Equal(t, "control", reloaded.MacroArchetype)
}

func TestUpdateDeckHandler_NotFound(t *testing.T) {
	cwd, _ := os.Getwd()
	t.Cleanup(func() { _ = os.Chdir(cwd) })
	require.NoError(t, os.Chdir(t.TempDir()))
	seedCube(t, "testcube", "d1", "p1")

	store := storage.NewFileDeckStoreWithCache()
	rec := httptest.NewRecorder()
	UpdateDeckHandler(store).ServeHTTP(rec, updateReq(t, "testcube", UpdateDeckMetaRequest{
		DraftID: "d1", Player: "ghost",
	}))
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestUpdateDeckHandler_BadRequest(t *testing.T) {
	store := storage.NewFileDeckStoreWithCache()
	rec := httptest.NewRecorder()
	UpdateDeckHandler(store).ServeHTTP(rec, updateReq(t, "testcube", UpdateDeckMetaRequest{
		Player: "p1", // missing DraftID
	}))
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestUpdateDeckHandler_MalformedJSON(t *testing.T) {
	store := storage.NewFileDeckStoreWithCache()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/testcube/decks/update", bytes.NewReader([]byte("{not json")))
	req.SetPathValue("cube", "testcube")
	UpdateDeckHandler(store).ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}
