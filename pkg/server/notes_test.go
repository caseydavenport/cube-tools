package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage/file"
	"github.com/stretchr/testify/require"
)

func saveNotesReq(t *testing.T, cube, draftID, id, content string) *http.Request {
	t.Helper()
	body, _ := json.Marshal(SaveNotesRequest{DraftID: draftID, ID: id, Content: content})
	req := httptest.NewRequest(http.MethodPost, "/api/"+cube+"/save-notes", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), cubeKey, cube))
	return req
}

func TestSaveNotes_RejectsEmptyCubeContext(t *testing.T) {
	store := file.NewStore(nil)
	rec := httptest.NewRecorder()
	body, _ := json.Marshal(SaveNotesRequest{DraftID: "2024-01-01", ID: "casey", Content: "hi"})
	req := httptest.NewRequest(http.MethodPost, "/api/save-notes", bytes.NewReader(body))
	SaveNotesHandler(store).ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestSaveNotes_RejectsTraversalInDraftID(t *testing.T) {
	tmp := t.TempDir()
	cwd, _ := os.Getwd()
	t.Cleanup(func() { _ = os.Chdir(cwd) })
	require.NoError(t, os.Chdir(tmp))

	store := file.NewStore(nil)
	rec := httptest.NewRecorder()
	SaveNotesHandler(store).ServeHTTP(rec, saveNotesReq(t, "polyverse", "../etc", "casey", "hi"))
	require.Equal(t, http.StatusInternalServerError, rec.Code)

	_, err := os.Stat(filepath.Join(tmp, "data", "polyverse"))
	require.True(t, os.IsNotExist(err), "backend must not have written anything")
}

func TestSaveNotes_RejectsTraversalInID(t *testing.T) {
	tmp := t.TempDir()
	cwd, _ := os.Getwd()
	t.Cleanup(func() { _ = os.Chdir(cwd) })
	require.NoError(t, os.Chdir(tmp))

	store := file.NewStore(nil)
	rec := httptest.NewRecorder()
	SaveNotesHandler(store).ServeHTTP(rec, saveNotesReq(t, "polyverse", "2024-01-01", "../casey", "hi"))
	require.Equal(t, http.StatusInternalServerError, rec.Code)

	_, err := os.Stat(filepath.Join(tmp, "data", "polyverse"))
	require.True(t, os.IsNotExist(err), "backend must not have written anything")
}

func TestSaveNotes_AcceptsValid(t *testing.T) {
	tmp := t.TempDir()
	cwd, _ := os.Getwd()
	t.Cleanup(func() { _ = os.Chdir(cwd) })
	require.NoError(t, os.Chdir(tmp))

	store := file.NewStore(nil)
	rec := httptest.NewRecorder()
	SaveNotesHandler(store).ServeHTTP(rec, saveNotesReq(t, "polyverse", "2024-01-01", "casey", "hello"))
	require.Equal(t, http.StatusOK, rec.Code)

	got, err := os.ReadFile(filepath.Join("data", "polyverse", "2024-01-01", "casey.report.md"))
	require.NoError(t, err)
	require.Equal(t, "hello", string(got))
}
