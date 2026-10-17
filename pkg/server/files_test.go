package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
)

func getDraftLog(store *storage.Store, draftID string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	mux.Handle("GET /api/{cube}/drafts/{draft_id}/log", DraftLogHandler(store))
	r := httptest.NewRequest(http.MethodGet, "/api/testcube/drafts/"+draftID+"/log", nil)
	r = r.WithContext(context.WithValue(r.Context(), cubeKey, "testcube"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	return rec
}

func TestDraftLogHandlerRejectsNonNumericID(t *testing.T) {
	b := memory.New()
	b.SeedDraftLog("testcube", 1, []byte(`{"picks":[]}`))
	store := storage.NewStore(b)

	if rec := getDraftLog(store, "1"); rec.Code != http.StatusOK {
		t.Fatalf("draft 1: status %d, want 200", rec.Code)
	}
	for _, id := range []string{"abc", "0001_2026-01-01", "-1", "0"} {
		if rec := getDraftLog(store, id); rec.Code != http.StatusNotFound {
			t.Errorf("draft %q: status %d, want 404", id, rec.Code)
		}
	}
}
