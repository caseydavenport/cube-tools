package ocr

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// cubeSource is the live CubeCobra fallback for resolving a cube list when no
// snapshot exists on disk. Set once at startup via SetCubeSource, then only
// read, so no locking is needed. Without it, cubes whose lists come live from
// CubeCobra (no on-disk snapshot) fail every OCR cube-list load.
var cubeSource types.CubeSource

// SetCubeSource wires the live cube provider into the OCR handlers.
func SetCubeSource(s types.CubeSource) {
	cubeSource = s
}

// draftFromRequest resolves the request's {draft_id} to a draft of its cube.
// It reports false for a missing cube, a non-numeric ID or an unknown draft.
func draftFromRequest(dataRoot string, r *http.Request) (drafts.Draft, bool) {
	cube := server.CubeFromRequest(r)
	id, err := strconv.Atoi(r.PathValue("draft_id"))
	if cube == "" || err != nil || id < 1 {
		return drafts.Draft{}, false
	}
	d, err := drafts.Find(filepath.Join(dataRoot, cube), id)
	if err != nil {
		return drafts.Draft{}, false
	}
	return d, true
}

// loadCubeForDraft loads the cube list for a draft, preferring the draft's own
// snapshot and falling back to the cube's latest snapshot, then the live
// source, when it has none.
func loadCubeForDraft(dataRoot, cube string, draft drafts.Draft) (*types.Cube, error) {
	if cl, err := draft.Snapshot(); !errors.Is(err, drafts.ErrNotFound) {
		return cl, err
	}
	cl, ok, err := drafts.LatestSnapshot(filepath.Join(dataRoot, cube))
	if err != nil {
		return nil, err
	}
	if ok {
		return cl, nil
	}
	if cubeSource != nil {
		return cubeSource.Current(cube)
	}
	return nil, fmt.Errorf("no cube list found for %q", cube)
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
