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

	"github.com/stretchr/testify/require"
)

func saveNotesReq(t *testing.T, cube, path, content string) *http.Request {
	t.Helper()
	body, _ := json.Marshal(SaveNotesRequest{Path: path, Content: content})
	req := httptest.NewRequest(http.MethodPost, "/api/"+cube+"/save-notes", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), cubeKey, cube))
	return req
}

func TestSaveNotes_RejectsPathOutsideCube(t *testing.T) {
	rec := httptest.NewRecorder()
	SaveNotesHandler().ServeHTTP(rec, saveNotesReq(t, "polyverse", "data/aurora/2024-01-01/x.report.md", "hi"))
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestSaveNotes_RejectsTraversal(t *testing.T) {
	rec := httptest.NewRecorder()
	SaveNotesHandler().ServeHTTP(rec, saveNotesReq(t, "polyverse", "data/polyverse/../etc/passwd", "hi"))
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestSaveNotes_RejectsLookalikePrefix(t *testing.T) {
	rec := httptest.NewRecorder()
	SaveNotesHandler().ServeHTTP(rec, saveNotesReq(t, "polyverse", "data/polyverse-evil/x.report.md", "hi"))
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestSaveNotes_AcceptsValid(t *testing.T) {
	tmp := t.TempDir()
	rel := filepath.Join("data", "polyverse", "2024-01-01", "x.report.md")
	cwd, _ := os.Getwd()
	t.Cleanup(func() { _ = os.Chdir(cwd) })
	require.NoError(t, os.Chdir(tmp))

	rec := httptest.NewRecorder()
	SaveNotesHandler().ServeHTTP(rec, saveNotesReq(t, "polyverse", rel, "hello"))
	require.Equal(t, http.StatusOK, rec.Code)

	got, err := os.ReadFile(rel)
	require.NoError(t, err)
	require.Equal(t, "hello", string(got))
}

func TestSaveNotes_RejectsEmptyCubeContext(t *testing.T) {
	rec := httptest.NewRecorder()
	body, _ := json.Marshal(SaveNotesRequest{Path: "data/polyverse/x.report.md", Content: "hi"})
	req := httptest.NewRequest(http.MethodPost, "/api/save-notes", bytes.NewReader(body))
	SaveNotesHandler().ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}
