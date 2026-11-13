package ocr

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// cubeSource is the live CubeCobra fallback for a cube list with no snapshot on
// disk. SetCubeSource sets it once at startup, so reads need no lock.
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

// writeJSON encodes v as indented JSON to the response. An encode error is
// only logged: by then the status line is sent, so the client can't be told.
func writeJSON(rw http.ResponseWriter, v any) {
	rw.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(rw)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		logrus.WithError(err).Warn("Could not write JSON response")
	}
}

// closeAndLog closes c and logs a failure naming path. It is for files that
// were only read, where a failed close loses nothing the caller needs.
func closeAndLog(c io.Closer, path string) {
	if err := c.Close(); err != nil {
		logrus.WithError(err).WithField("path", path).Warn("Could not close file")
	}
}

// removeAndLog deletes a leftover temp file and logs a failure.
func removeAndLog(path string) {
	if err := os.Remove(path); err != nil {
		logrus.WithError(err).WithField("path", path).Warn("Could not remove temp file")
	}
}
