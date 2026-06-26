package decks

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
)

type DecksResponse struct {
	Decks []*storage.Deck `json:"decks"`
}

func DeckHandler(store storage.DeckStorage) http.Handler {
	return &deckHandler{
		store: store,
	}
}

type deckHandler struct {
	store storage.DeckStorage
}

func (d *deckHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	start := time.Now()

	dr := ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/decks")

	logrus.WithField("time", time.Since(start)).Info("Parse")
	resp := DecksResponse{}
	decks, err := d.store.List(r.PathValue("cube"), dr)
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

type UpdateDeckMetaRequest struct {
	DraftID        string   `json:"draft_id"`
	Player         string   `json:"player"`
	MacroArchetype string   `json:"macro_archetype"`
	Labels         []string `json:"labels"`
	Colors         []string `json:"colors"`
}

func UpdateDeckHandler(store storage.DeckStorage) http.Handler {
	return &updateDeckHandler{store: store}
}

type updateDeckHandler struct {
	store storage.DeckStorage
}

func (h *updateDeckHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	var req UpdateDeckMetaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(rw, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.DraftID == "" || req.Player == "" {
		http.Error(rw, "draft_id and player are required", http.StatusBadRequest)
		return
	}

	updated, err := h.store.UpdateDeckMeta(r.PathValue("cube"), req.DraftID, req.Player, req.MacroArchetype, req.Labels, req.Colors)
	if errors.Is(err, storage.ErrDeckNotFound) {
		http.Error(rw, "Deck not found", http.StatusNotFound)
		return
	}
	if err != nil {
		logrus.WithError(err).Error("Failed to update deck metadata")
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
		return
	}

	b, err := json.Marshal(updated)
	if err != nil {
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("Failed to write deck update response")
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
