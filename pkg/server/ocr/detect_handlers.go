package ocr

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"

	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

type detectRequest struct {
	Photo string `json:"photo"`
}

type regionRequest struct {
	Photo string      `json:"photo"`
	Box   ocrpkg.Bbox `json:"box"`
}

// resolvePhoto validates the relative photo path and returns its absolute
// on-disk path plus the cube loaded for the draft date in the path.
func resolvePhoto(dataRoot, cube, rel string) (string, *types.Cube, bool) {
	if cube == "" || rel == "" || strings.Contains(rel, "..") {
		return "", nil, false
	}
	abs := filepath.Clean(filepath.Join(dataRoot, cube, rel))
	prefix := filepath.Clean(filepath.Join(dataRoot, cube)) + string(filepath.Separator)
	if !strings.HasPrefix(abs, prefix) {
		return "", nil, false
	}
	// Draft date is the first 10 chars of the first path segment.
	seg := strings.SplitN(rel, "/", 2)[0]
	date := ""
	if len(seg) >= 10 {
		date = seg[:10]
	}
	cube2, err := types.LoadCubeList(types.LoadOptions{DataRoot: dataRoot, Cube: cube, Date: date})
	if err != nil {
		cube2, err = types.LoadCubeList(types.LoadOptions{DataRoot: dataRoot, Cube: cube})
		if err != nil {
			return "", nil, false
		}
	}
	return abs, cube2, true
}

func DetectHandler(det Detector) http.Handler { return DetectHandlerWithRoot(det, "data") }

func DetectHandlerWithRoot(det Detector, dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		var req detectRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		abs, cl, ok := resolvePhoto(dataRoot, cube, req.Photo)
		if !ok {
			http.Error(rw, "Invalid path", http.StatusForbidden)
			return
		}
		results, err := det.DetectPhoto(abs, cl)
		if err != nil {
			http.Error(rw, err.Error(), http.StatusInternalServerError)
			return
		}
		lines := make([]LineJSON, 0, len(results))
		for _, res := range results {
			lines = append(lines, toLineJSON(res))
		}
		writeJSON(rw, map[string]any{"lines": lines})
	})
}

func RegionHandler(det Detector) http.Handler { return RegionHandlerWithRoot(det, "data") }

func RegionHandlerWithRoot(det Detector, dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		var req regionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		abs, cl, ok := resolvePhoto(dataRoot, cube, req.Photo)
		if !ok {
			http.Error(rw, "Invalid path", http.StatusForbidden)
			return
		}
		res, err := det.MatchRegion(abs, req.Box, cl)
		if err != nil {
			http.Error(rw, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(rw, toLineJSON(res))
	})
}
