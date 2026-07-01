package importer

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/server"
)

// HedronImportRequest selects one Hedron draft to import into the current cube.
type HedronImportRequest struct {
	CubeID  string `json:"cube_id"`
	DraftID string `json:"draft_id"`
}

// HedronListHandler returns the drafts Hedron Network has for a CubeCobra id,
// passed as the cubeId query parameter.
func HedronListHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if server.CubeFromRequest(r) == "" {
			http.NotFound(rw, r)
			return
		}
		cubeID := r.URL.Query().Get("cubeId")
		if cubeID == "" {
			http.Error(rw, "cubeId is required", http.StatusBadRequest)
			return
		}
		drafts, err := commands.ListHedronDrafts(cubeID)
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(rw, map[string]any{"drafts": drafts})
	})
}

// HedronImportHandler imports a selected Hedron draft into the request's cube,
// downloading its photos into an OCR-ready draft directory and reindexing. It
// returns the local draft id the UI should open in the OCR flow.
func HedronImportHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		var req HedronImportRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "invalid request", http.StatusBadRequest)
			return
		}
		if req.CubeID == "" || req.DraftID == "" {
			http.Error(rw, "cube_id and draft_id are required", http.StatusBadRequest)
			return
		}
		localID, err := commands.ImportHedronDraft(cube, req.CubeID, req.DraftID)
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(rw, map[string]any{"draft_id": localID})
	})
}
