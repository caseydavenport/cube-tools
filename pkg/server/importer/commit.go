package importer

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CommitRequest is the reviewed, ready-to-write draft. A commit always
// creates a new draft, numbered after the cube's existing ones.
type CommitRequest struct {
	Date      string       `json:"date"`
	EventName string       `json:"event_name,omitempty"`
	EventCode string       `json:"event_code,omitempty"`
	Decks     []ParsedDeck `json:"decks"`
}

// buildDeck assembles a types.Deck for one reviewed player. A pool-only deck is
// stored as a pool; a deck with a mainboard stores main + sideboard. Card
// expansion uses the shared types.ExpandCounted helper (Task 1b).
func buildDeck(d ParsedDeck, date string, draftID int) *types.Deck {
	deck := types.NewDeck()
	deck.PlayerID = d.PlayerID
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

// checkPlayerIDs reports a deck whose player isn't in the list, or a player
// picked for two decks. Zero, an anonymous seat, always passes.
func checkPlayerIDs(dataRoot string, decks []ParsedDeck) error {
	pl, err := players.Load(dataRoot)
	if err != nil {
		return err
	}
	seen := map[int]bool{}
	for _, pd := range decks {
		if pd.PlayerID == 0 {
			continue
		}
		if _, ok := pl.ByID(pd.PlayerID); !ok {
			return fmt.Errorf("unknown player id %d", pd.PlayerID)
		}
		if seen[pd.PlayerID] {
			return fmt.Errorf("player id %d is picked for two decks", pd.PlayerID)
		}
		seen[pd.PlayerID] = true
	}
	return nil
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
		if _, err := time.Parse(time.DateOnly, req.Date); err != nil || len(req.Decks) == 0 {
			http.Error(rw, "a YYYY-MM-DD date and at least one deck are required", http.StatusBadRequest)
			return
		}
		if err := checkPlayerIDs(dataRoot, req.Decks); err != nil {
			http.Error(rw, err.Error(), http.StatusBadRequest)
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

		draft, err := drafts.Create(filepath.Join(dataRoot, cube), types.DraftMetadata{
			Date:      req.Date,
			EventName: req.EventName,
			EventCode: req.EventCode,
		})
		if err != nil {
			http.Error(rw, "internal server error", http.StatusInternalServerError)
			return
		}

		if err := os.WriteFile(filepath.Join(draft.Dir, "cube-snapshot.json"), snapshot, 0o644); err != nil {
			http.Error(rw, "internal server error", http.StatusInternalServerError)
			return
		}

		for i, pd := range req.Decks {
			deck := buildDeck(pd, req.Date, draft.ID)
			deck.ID = i + 1

			// An anonymous deck sits at its deck number, the order it was imported in.
			if deck.PlayerID == 0 {
				deck.Seat = deck.ID
			}
			deck.Metadata.Path = drafts.DeckPath(draft.Dir, deck.ID)
			if err := deck.Save(deck.Metadata.Path); err != nil {
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
		writeJSON(rw, map[string]any{"draft_id": draft.ID})
	})
}
