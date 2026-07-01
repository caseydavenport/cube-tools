package importer

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/server"
)

func TestHedronListRequiresCubeID(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/polyverse/import/hedron", nil)
	req = req.WithContext(server.ContextWithCube(req.Context(), "polyverse"))
	rw := httptest.NewRecorder()
	HedronListHandler().ServeHTTP(rw, req)
	if rw.Code != http.StatusBadRequest {
		t.Fatalf("want 400 when cubeId is absent, got %d", rw.Code)
	}
}

func TestHedronImportRequiresFields(t *testing.T) {
	rw := postJSON(t, HedronImportHandler(), "polyverse", "/api/polyverse/import/hedron", HedronImportRequest{})
	if rw.Code != http.StatusBadRequest {
		t.Fatalf("want 400 when cubeId/draftId absent, got %d", rw.Code)
	}
}
