package ocr

import (
	"encoding/json"
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ConfirmRequest is what the review page posts to write a player's deck: their
// drafted pool, the mainboard and sideboard they built from it, and their basic
// lands. A pool with no mainboard and no basics saves just the pool.
type ConfirmRequest struct {
	Pool      []types.CountedCard `json:"pool"`
	Mainboard []types.CountedCard `json:"mainboard"`
	Sideboard []types.CountedCard `json:"sideboard"`
	Basics    map[string]int      `json:"basics"`
}

// buildDeck writes the request's lists into the existing deck, keeping its
// matches and player. A request with a mainboard or basics stores the mainboard
// and sideboard (the pool is dropped); one without stores just the pool.
func buildDeck(deck *types.Deck, req ConfirmRequest) *types.Deck {
	hasMainboard := len(req.Mainboard) > 0 || len(req.Basics) > 0
	if !hasMainboard {
		deck.Pool = types.ExpandCounted(req.Pool)
		deck.Mainboard = []types.Card{}
		deck.Sideboard = []types.Card{}
		return deck
	}
	mainboard := types.ExpandCounted(req.Mainboard)
	basics := make([]types.CountedCard, 0, len(req.Basics))
	for name, n := range req.Basics {
		basics = append(basics, types.CountedCard{Name: name, Count: n})
	}
	deck.Mainboard = append(mainboard, types.ExpandCounted(basics)...)

	// The client sends the sideboard so cards can move between it and the
	// mainboard by hand, even for a deck-only scan. Derive it from the pool
	// for callers that omit it.
	if req.Sideboard != nil {
		deck.Sideboard = types.ExpandCounted(req.Sideboard)
	} else {
		deck.Sideboard = types.DeriveSideboard(req.Pool, req.Mainboard)
	}
	deck.Pool = nil
	return deck
}

// ConfirmHandler writes the posted lists to the player's deck file and marks
// the player confirmed in the draft's session. It is 404 for an unknown draft
// or a player that isn't a seat folder like "p3".
func ConfirmHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		player := r.PathValue("player")
		seat := drafts.SeatNumber(player)
		if !ok || seat == 0 {
			http.NotFound(rw, r)
			return
		}
		var req ConfirmRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		existing, err := draft.Deck(seat)
		if err != nil {
			http.Error(rw, "deck not found: "+err.Error(), http.StatusNotFound)
			return
		}
		if err := draft.SaveDeck(buildDeck(existing, req)); err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Marking the session is a load-modify-save, so take the same lock as
		// the autosave and background scan or it races with them.
		sessionSaveMu.Lock()
		defer sessionSaveMu.Unlock()
		session, err := LoadSession(draft)
		if err != nil {
			logrus.WithError(err).WithField("draft", draft.ID).Warn("Confirmed deck but could not load session to mark it")
			rw.WriteHeader(http.StatusOK)
			return
		}
		if work := session.Players[player]; work != nil {
			work.Status = playerConfirmed
			if err := session.Save(draft); err != nil {
				http.Error(rw, "Internal server error", http.StatusInternalServerError)
				return
			}
		}
		rw.WriteHeader(http.StatusOK)
	})
}
