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

// CommitRequest is the reviewed, ready-to-write draft. v1 only creates new
// drafts, so DraftID must not already exist on disk.
type CommitRequest struct {
	DraftID   string       `json:"draft_id"`
	Date      string       `json:"date"`
	EventName string       `json:"event_name,omitempty"`
	Decks     []ParsedDeck `json:"decks"`
}

// buildDeck assembles a types.Deck for one reviewed player. A pool-only deck is
// stored as a pool; a deck with a mainboard stores main + sideboard. Card
// expansion uses the shared types.ExpandCounted helper (Task 1b).
func buildDeck(d ParsedDeck, date, draftID string) *types.Deck {
	deck := types.NewDeck()
	deck.Player = strings.ToLower(d.Player)
	deck.Date = date
	deck.Metadata.DraftID = draftID
	if len(d.Mainboard) == 0 && len(d.Pool) > 0 {
		deck.Pool = types.ExpandCounted(d.Pool)
		deck.Mainboard = []types.Card{}
		deck.Sideboard = []types.Card{}
		return deck
	}
	deck.Mainboard = types.ExpandCounted(d.Mainboard)
	if len(d.Sideboard) > 0 {
		deck.Sideboard = types.ExpandCounted(d.Sideboard)
	} else {
		deck.Sideboard = []types.Card{}
	}
	return deck
}

// CommitHandler writes a reviewed draft to disk and reindexes.
func CommitHandler(src types.CubeSource) http.Handler { return CommitHandlerWithRoot(src, "data") }

// CommitHandlerWithRoot is CommitHandler with an overridable data root.
func CommitHandlerWithRoot(src types.CubeSource, dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		if cube == "" {
			http.NotFound(rw, r)
			return
		}
		var req CommitRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "invalid request", http.StatusBadRequest)
			return
		}
		if !validID(req.DraftID) {
			http.Error(rw, "invalid draft id", http.StatusBadRequest)
			return
		}
		if req.Date == "" || len(req.Decks) == 0 {
			http.Error(rw, "date and at least one deck are required", http.StatusBadRequest)
			return
		}

		outdir := filepath.Join(dataRoot, cube, req.DraftID)
		if _, err := os.Stat(outdir); err == nil {
			http.Error(rw, "draft already exists", http.StatusConflict)
			return
		}

		// Snapshot the cube as it is right now, straight from Cube Cobra, before
		// creating anything. If that fetch fails we don't want a half-written
		// draft with no snapshot, so block the whole commit.
		cl, err := src.Refresh(cube)
		if err != nil {
			http.Error(rw, "could not snapshot cube: "+err.Error(), http.StatusBadGateway)
			return
		}
		snapshot, err := json.Marshal(cl)
		if err != nil {
			http.Error(rw, "internal server error", http.StatusInternalServerError)
			return
		}

		if err := os.MkdirAll(outdir, os.ModePerm); err != nil {
			http.Error(rw, "internal server error", http.StatusInternalServerError)
			return
		}

		meta := &types.DraftMetadata{DraftID: req.DraftID, EventName: req.EventName}
		if err := meta.Save(outdir); err != nil {
			http.Error(rw, "internal server error", http.StatusInternalServerError)
			return
		}

		if err := os.WriteFile(filepath.Join(outdir, "cube-snapshot.json"), snapshot, 0o644); err != nil {
			http.Error(rw, "internal server error", http.StatusInternalServerError)
			return
		}

		for _, pd := range req.Decks {
			if !validID(pd.Player) {
				http.Error(rw, "invalid player name: "+pd.Player, http.StatusBadRequest)
				return
			}
			deck := buildDeck(pd, req.Date, req.DraftID)
			path := filepath.Join(outdir, strings.ToLower(pd.Player)+".json")
			deck.Metadata.Path = path
			if err := deck.Save(path); err != nil {
				http.Error(rw, "internal server error", http.StatusInternalServerError)
				return
			}
		}

		if dataRoot == "data" {
			if err := commands.Index(cube); err != nil {
				http.Error(rw, "indexing failed: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
		writeJSON(rw, map[string]any{"draft_id": req.DraftID})
	})
}
