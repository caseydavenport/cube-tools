package ocr

import (
	"encoding/json"
	"net/http"
	"path/filepath"

	"github.com/caseydavenport/cube-tools/pkg/cubes"
	"github.com/caseydavenport/cube-tools/pkg/drafts"
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

// resolvePhoto validates a photo path relative to the draft and returns its
// absolute on-disk path plus the draft's cube list.
func resolvePhoto(dataRoot, cube string, draft drafts.Draft, rel string) (string, *types.Cube, bool) {
	abs, ok := draft.PhotoPath(rel)
	if !ok {
		return "", nil, false
	}
	cl, err := loadCubeForDraft(dataRoot, cube, draft)
	if err != nil {
		return "", nil, false
	}
	return abs, cl, true
}

// sleeveColorFor looks up a cube's configured sleeve color in the registry.
// Returns "" (the default sleeve color) when the registry can't be read or the
// cube has no sleeve color set.
func sleeveColorFor(dataRoot, cube string) string {
	reg, err := cubes.Load(filepath.Join(dataRoot, "cubes.json"))
	if err != nil {
		return ""
	}
	c, ok := reg.Get(cube)
	if !ok {
		return ""
	}
	return c.SleeveColor
}

func DetectHandler(det Detector) http.Handler { return DetectHandlerWithRoot(det, "data") }

func DetectHandlerWithRoot(det Detector, dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		var req detectRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		abs, cl, ok := resolvePhoto(dataRoot, cube, draft, req.Photo)
		if !ok {
			http.Error(rw, "Invalid path", http.StatusForbidden)
			return
		}
		results, err := det.DetectPhoto(abs, cl, sleeveColorFor(dataRoot, cube))
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
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		var req regionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		abs, cl, ok := resolvePhoto(dataRoot, cube, draft, req.Photo)
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
