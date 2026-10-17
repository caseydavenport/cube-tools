package decks

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/sirupsen/logrus"
)

type DecksResponse struct {
	Decks []*storage.Deck `json:"decks"`
}

// EdgesLoader returns a cube's design-graph clustering edges. DeckHandler uses it
// to answer a community: filter term; injected by the caller so this package
// needn't import the stats package (which imports this one).
type EdgesLoader func(cubeID string) ([]graph.Edge, error)

func DeckHandler(store storage.DeckStorage, edgesFor EdgesLoader) http.Handler {
	return &deckHandler{
		store:    store,
		edgesFor: edgesFor,
	}
}

type deckHandler struct {
	store    storage.DeckStorage
	edgesFor EdgesLoader
}

func (d *deckHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	start := time.Now()

	cubeID := r.PathValue("cube")
	dr := ParseDecksRequest(r)

	// A community: term needs the cube design graph to cluster each deck. Load it
	// only when the filter actually asks for one.
	if d.edgesFor != nil && strings.Contains(dr.Match, "community") {
		if edges, err := d.edgesFor(cubeID); err != nil {
			logrus.WithError(err).Warn("could not load design graph for community filter")
		} else {
			dr.CommunityEdges = edges
		}
	}

	logrus.WithField("params", dr).Info("/api/decks")

	logrus.WithField("time", time.Since(start)).Info("Parse")
	resp := DecksResponse{}
	decks, err := d.store.List(cubeID, dr)
	if err != nil {
		panic(err)
	}
	resp.Decks = decks
	logrus.WithField("time", time.Since(start)).Info("List")

	// Marshal the response and write it back.
	b, err := json.Marshal(resp)
	if err != nil {
		panic(err)
	}
	logrus.WithField("time", time.Since(start)).Info("Marshal")
	_, err = rw.Write(b)
	if err != nil {
		panic(err)
	}
	logrus.WithField("time", time.Since(start)).Info("Write")
}

// UpdateDeckMetaRequest is the body of POST /api/{cube}/decks/update. Notes
// absent leaves the deck's notes unchanged; "" clears them.
type UpdateDeckMetaRequest struct {
	DraftID        int      `json:"draft_id"`
	ID             int      `json:"id"`
	MacroArchetype string   `json:"macro_archetype"`
	Labels         []string `json:"labels"`
	Colors         []string `json:"colors"`
	Notes          *string  `json:"notes"`
}

// MetaUpdater writes a deck's annotations. UpdateDeckHandler depends on this
// narrow interface rather than the full DeckStorage.
type MetaUpdater interface {
	UpdateDeckMeta(cube string, w storage.DeckMetaWrite) (*storage.Deck, error)
}

// UpdateDeckHandler serves POST /api/{cube}/decks/update, writing a deck's
// annotations and responding with the updated deck. Unknown decks get 404, and
// cubes whose backend can't write get 400.
func UpdateDeckHandler(store MetaUpdater) http.Handler {
	return &updateDeckHandler{store: store}
}

type updateDeckHandler struct {
	store MetaUpdater
}

func (h *updateDeckHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	var req UpdateDeckMetaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(rw, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.DraftID == 0 || req.ID == 0 {
		http.Error(rw, "draft_id and id are required", http.StatusBadRequest)
		return
	}

	updated, err := h.store.UpdateDeckMeta(r.PathValue("cube"), storage.DeckMetaWrite{
		DraftID:        req.DraftID,
		DeckID:         req.ID,
		MacroArchetype: req.MacroArchetype,
		Labels:         req.Labels,
		Colors:         req.Colors,
		Notes:          req.Notes,
	})
	if writeStoreError(rw, err, "Failed to update deck metadata") {
		return
	}
	writeJSON(rw, updated)
}

// RecordSaver saves a deck's record and reconciles its draft. UpdateDeckRecordHandler
// depends on this narrow interface rather than the full DeckStorage.
type RecordSaver interface {
	SaveDeckRecord(cube string, e storage.RecordEdit) ([]*storage.Deck, error)
}

// UpdateDeckRecordRequest is the body of POST /api/{cube}/decks/record. Player
// absent keeps the name; matches absent keeps the record.
type UpdateDeckRecordRequest struct {
	DraftID int           `json:"draft_id"`
	ID      int           `json:"id"`
	Player  string        `json:"player"`
	Matches []types.Match `json:"matches"`
}

func UpdateDeckRecordHandler(store RecordSaver) http.Handler {
	return &updateDeckRecordHandler{store: store}
}

type updateDeckRecordHandler struct {
	store RecordSaver
}

func (h *updateDeckRecordHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	var req UpdateDeckRecordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(rw, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.DraftID == 0 || req.ID == 0 {
		http.Error(rw, "draft_id and id are required", http.StatusBadRequest)
		return
	}
	changed, err := h.store.SaveDeckRecord(r.PathValue("cube"), storage.RecordEdit{
		DraftID: req.DraftID,
		DeckID:  req.ID,
		Player:  req.Player,
		Matches: req.Matches,
	})
	if writeStoreError(rw, err, "Failed to save deck record") {
		return
	}
	writeJSON(rw, DecksResponse{Decks: changed})
}

// writeStoreError maps a deck-write error to its HTTP status and writes it,
// reporting whether there was an error. Unexpected errors are logged with msg
// and returned as 500.
func writeStoreError(rw http.ResponseWriter, err error, msg string) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, storage.ErrDeckNotFound):
		http.Error(rw, "Deck not found", http.StatusNotFound)
	case errors.Is(err, storage.ErrPlayerExists):
		http.Error(rw, "Another deck in this draft already has that player name", http.StatusConflict)
	case errors.Is(err, storage.ErrUnsupported):
		http.Error(rw, "Not supported for this cube", http.StatusBadRequest)
	default:
		logrus.WithError(err).Error(msg)
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
	}
	return true
}

// writeJSON writes v as a JSON response body.
func writeJSON(rw http.ResponseWriter, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("Failed to write deck response")
	}
}

func ParseDecksRequest(r *http.Request) *storage.DecksRequest {
	// Pull deck params from the request.
	p := storage.DecksRequest{}
	p.Player = query.GetString(r, "player")
	p.Start = query.GetString(r, "start")
	p.End = query.GetString(r, "end")
	p.DraftSize = query.GetInt(r, "size")
	p.Match = query.GetString(r, "match")
	p.Board = query.GetString(r, "board")
	return &p
}
