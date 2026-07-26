package importer

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/server"
)

// PhotoScanRequest names a server-side folder of deck photos to inspect.
type PhotoScanRequest struct {
	SourcePath string `json:"source_path"`
}

// PhotoImportRequest describes a draft to build from a folder of deck photos.
type PhotoImportRequest struct {
	SourcePath string `json:"source_path"`
	Date       string `json:"date"`
	Slug       string `json:"slug"`
	EventName  string `json:"event_name"`
	Flight     string `json:"flight"`
}

// PhotoScanHandler lists the image files under a server-side folder so the UI
// can show how many players it found before building the draft.
func PhotoScanHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if server.CubeFromRequest(r) == "" {
			http.NotFound(rw, r)
			return
		}
		var req PhotoScanRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "invalid request", http.StatusBadRequest)
			return
		}
		if req.SourcePath == "" {
			http.Error(rw, "source_path is required", http.StatusBadRequest)
			return
		}
		images, err := commands.ScanPhotoFolder(req.SourcePath)
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(rw, map[string]any{"images": images, "count": len(images)})
	})
}

// PhotoImportHandler builds an OCR-ready draft directory from a folder of deck
// photos and returns the local draft id the UI should open in the OCR flow.
func PhotoImportHandler() http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		var req PhotoImportRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "invalid request", http.StatusBadRequest)
			return
		}
		if req.SourcePath == "" || req.Date == "" || req.Slug == "" {
			http.Error(rw, "source_path, date, and slug are required", http.StatusBadRequest)
			return
		}
		draftID, err := commands.BuildPhotoDraft(cube, req.SourcePath, req.Date, req.Slug, req.EventName, req.Flight)
		if err != nil {
			http.Error(rw, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(rw, map[string]any{"draft_id": draftID})
	})
}
