package ocr

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// validDraftID rejects empty ids and anything that could escape the data dir
// (path separators or "..") - draft ids land directly in filesystem paths.
func validDraftID(id string) bool {
	return id != "" && !strings.ContainsAny(id, `/\`) && !strings.Contains(id, "..")
}

// loadCubeForDraft loads the cube list for a draft, preferring the snapshot for
// the draft's date (the first 10 chars of the ID) and falling back to the
// latest snapshot when that date has none.
func loadCubeForDraft(dataRoot, cube, draftID string) (*types.Cube, error) {
	date := ""
	if len(draftID) >= 10 {
		date = draftID[:10]
	}
	cl, err := types.LoadCubeList(types.LoadOptions{DataRoot: dataRoot, Cube: cube, Date: date})
	if err != nil {
		return types.LoadCubeList(types.LoadOptions{DataRoot: dataRoot, Cube: cube})
	}
	return cl, nil
}

// writeJSON encodes v as indented JSON to the response. Encode errors are
// ignored: by the time encoding fails the status line is already sent, so
// there's nothing useful left to tell the client.
func writeJSON(rw http.ResponseWriter, v any) {
	rw.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(rw)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}
