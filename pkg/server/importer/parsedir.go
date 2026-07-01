package importer

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ParseDirRequest points at a server-side directory of deck files.
type ParseDirRequest struct {
	Dir      string `json:"dir"`
	Filetype string `json:"filetype"`
	Prefix   string `json:"prefix,omitempty"`
}

// playerFromFilename derives a player name from a deck filename: strip the
// prefix, the extension, and any "_suffix", lowercased. Mirrors the CLI's
// determinePlayer without its hardcoded nickname table.
func playerFromFilename(name, prefix string) string {
	trimmed := strings.ToLower(strings.TrimPrefix(strings.Split(name, ".")[0], prefix))
	return strings.Split(trimmed, "_")[0]
}

// ParseDirHandler parses every matching deck file in a server-side directory.
func ParseDirHandler() http.Handler { return ParseDirHandlerWithRoot("data") }

// ParseDirHandlerWithRoot is ParseDirHandler with an overridable data root.
func ParseDirHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		var req ParseDirRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "invalid request", http.StatusBadRequest)
			return
		}
		if req.Filetype == "" {
			req.Filetype = ".txt"
		}
		entries, err := os.ReadDir(req.Dir)
		if err != nil {
			http.Error(rw, "cannot read directory: "+err.Error(), http.StatusBadRequest)
			return
		}

		decks := []ParsedDeck{}
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() || strings.Contains(name, "cubecobra.txt") {
				continue
			}
			if req.Prefix != "" && !strings.HasPrefix(name, req.Prefix) {
				continue
			}
			if !strings.HasSuffix(name, req.Filetype) {
				continue
			}
			content, err := os.ReadFile(filepath.Join(req.Dir, name))
			if err != nil {
				http.Error(rw, "read "+name+": "+err.Error(), http.StatusBadRequest)
				return
			}
			mb, sb, err := commands.ParseDeckBytes(content, req.Filetype)
			if err != nil {
				http.Error(rw, "parse "+name+": "+err.Error(), http.StatusBadRequest)
				return
			}
			d := buildParsedDeck(playerFromFilename(name, req.Prefix), name, mb, sb)
			d.Warnings = warnUnresolved(string(content), req.Filetype)
			decks = append(decks, d)
		}

		cl, err := types.LoadCube(cubePath(dataRoot, cube))
		if err != nil {
			http.Error(rw, "no cube list: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(rw, ParseResponse{Decks: decks, Report: CheckConsistency(cl, decks)})
	})
}
