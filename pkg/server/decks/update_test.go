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
	"github.com/caseydavenport/cube-tools/pkg/storage/file"
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

	store := file.NewStore(nil)
	rec := httptest.NewRecorder()
	UpdateDeckHandler(store).ServeHTTP(rec, updateReq(t, "testcube", UpdateDeckMetaRequest{
		DraftID: "d1", ID: "p1", MacroArchetype: "control",
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

	store := file.NewStore(nil)
	rec := httptest.NewRecorder()
	UpdateDeckHandler(store).ServeHTTP(rec, updateReq(t, "testcube", UpdateDeckMetaRequest{
		DraftID: "d1", ID: "ghost",
	}))
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestUpdateDeckHandler_BadRequest(t *testing.T) {
	store := file.NewStore(nil)
	rec := httptest.NewRecorder()
	UpdateDeckHandler(store).ServeHTTP(rec, updateReq(t, "testcube", UpdateDeckMetaRequest{
		ID: "p1", // missing DraftID
	}))
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

type fakeRecordSaver struct {
	gotCube, gotDraft, gotDeck, gotPlayer string
	gotMatches                            []types.Match
	ret                                   []*storage.Deck
	err                                   error
}

func (f *fakeRecordSaver) SaveDeckRecord(cube, draftID, deckID, player string, matches []types.Match) ([]*storage.Deck, error) {
	f.gotCube, f.gotDraft, f.gotDeck, f.gotPlayer, f.gotMatches = cube, draftID, deckID, player, matches
	return f.ret, f.err
}

func recordReq(t *testing.T, cube string, body UpdateDeckRecordRequest) *http.Request {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/"+cube+"/decks/record", bytes.NewReader(b))
	req.SetPathValue("cube", cube)
	return req
}

func TestUpdateDeckRecordHandler_OK(t *testing.T) {
	fake := &fakeRecordSaver{ret: []*storage.Deck{{ID: "casey"}, {ID: "Bob"}}}
	rec := httptest.NewRecorder()
	UpdateDeckRecordHandler(fake).ServeHTTP(rec, recordReq(t, "testcube", UpdateDeckRecordRequest{
		DraftID: "d1", ID: "Alice", Player: "casey",
		Matches: []types.Match{{Opponent: "Bob", Wins: 2, Losses: 1}},
	}))
	require.Equal(t, http.StatusOK, rec.Code)

	var resp DecksResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Decks, 2)
	require.Equal(t, "d1", fake.gotDraft)
	require.Equal(t, "Alice", fake.gotDeck)
	require.Equal(t, "casey", fake.gotPlayer)
}

func TestUpdateDeckRecordHandler_NotFound(t *testing.T) {
	fake := &fakeRecordSaver{err: storage.ErrDeckNotFound}
	rec := httptest.NewRecorder()
	UpdateDeckRecordHandler(fake).ServeHTTP(rec, recordReq(t, "testcube", UpdateDeckRecordRequest{
		DraftID: "d1", ID: "ghost",
	}))
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestUpdateDeckRecordHandler_BadRequest(t *testing.T) {
	fake := &fakeRecordSaver{}
	rec := httptest.NewRecorder()
	UpdateDeckRecordHandler(fake).ServeHTTP(rec, recordReq(t, "testcube", UpdateDeckRecordRequest{
		ID: "Alice", // missing DraftID
	}))
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestUpdateDeckRecordHandler_MalformedJSON(t *testing.T) {
	fake := &fakeRecordSaver{}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/testcube/decks/record", bytes.NewReader([]byte("{not json")))
	req.SetPathValue("cube", "testcube")
	UpdateDeckRecordHandler(fake).ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestUpdateDeckHandler_MalformedJSON(t *testing.T) {
	store := file.NewStore(nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/testcube/decks/update", bytes.NewReader([]byte("{not json")))
	req.SetPathValue("cube", "testcube")
	UpdateDeckHandler(store).ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}
