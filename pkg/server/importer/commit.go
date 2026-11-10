package importer

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/server/httperr"
	"github.com/caseydavenport/cube-tools/pkg/storage"
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

// DraftCreator saves a new draft. storage.Store implements it, checking the
// cube is writable and every deck's player is valid.
type DraftCreator interface {
	CreateDraft(cube string, meta types.DraftMetadata, snapshot *types.Cube, decks []*storage.Deck) (int, error)
}

var _ DraftCreator = &storage.Store{}

// buildDeck assembles a types.Deck for one reviewed player. A pool-only deck is
// stored as a pool; a deck with a mainboard stores main + sideboard.
func buildDeck(d ParsedDeck, date string) *types.Deck {
	deck := types.NewDeck()
	deck.PlayerID = d.PlayerID
	deck.Date = date
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

// importDecks builds the new draft's decks, numbered in the order they were
// imported. An anonymous deck sits at its deck number.
func importDecks(req CommitRequest) []*storage.Deck {
	out := make([]*storage.Deck, 0, len(req.Decks))
	for i, pd := range req.Decks {
		deck := buildDeck(pd, req.Date)
		deck.ID = i + 1
		if deck.PlayerID == 0 {
			deck.Seat = deck.ID
		}
		out = append(out, &storage.Deck{Deck: *deck})
	}
	return out
}

// CommitHandler saves a reviewed draft as a new draft of the cube.
func CommitHandler(src types.CubeSource, dc DraftCreator) http.Handler {
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

		// Snapshot the cube as it is right now, straight from Cube Cobra, before
		// creating anything. If that fetch fails we don't want a draft with no
		// snapshot, so block the whole commit.
		cl, err := src.Refresh(cube)
		if err != nil {
			http.Error(rw, "could not snapshot cube: "+err.Error(), http.StatusBadGateway)
			return
		}

		meta := types.DraftMetadata{Date: req.Date, EventName: req.EventName, EventCode: req.EventCode}
		id, err := dc.CreateDraft(cube, meta, cl, importDecks(req))
		if errors.Is(err, storage.ErrUnknownPlayer) || errors.Is(err, storage.ErrPlayerExists) {
			http.Error(rw, err.Error(), http.StatusBadRequest)
			return
		}
		if httperr.WriteStoreError(rw, err, "Failed to save imported draft") {
			return
		}
		writeJSON(rw, map[string]any{"draft_id": id})
	})
}
