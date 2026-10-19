package ocr

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CountedCard aliases the shared type so existing OCR code and tests keep
// working while there is one underlying definition in pkg/types.
type CountedCard = types.CountedCard

type ConfirmRequest struct {
	Pool      []CountedCard  `json:"pool"`
	Mainboard []CountedCard  `json:"mainboard"`
	Sideboard []CountedCard  `json:"sideboard"`
	Basics    map[string]int `json:"basics"`
}

func buildDeck(existing *types.Deck, req ConfirmRequest) *types.Deck {
	d := existing
	hasMain := len(req.Mainboard) > 0 || len(req.Basics) > 0
	if !hasMain {
		d.Pool = types.ExpandCounted(req.Pool)
		d.Mainboard = []types.Card{}
		d.Sideboard = []types.Card{}
		return d
	}
	main := types.ExpandCounted(req.Mainboard)
	basics := make([]CountedCard, 0, len(req.Basics))
	for name, n := range req.Basics {
		basics = append(basics, CountedCard{Name: name, Count: n})
	}
	main = append(main, types.ExpandCounted(basics)...)
	d.Mainboard = main
	// The client sends an explicit sideboard so cards can be moved between the
	// mainboard and sideboard by hand, even for a deck-only scan with no pool.
	// Fall back to deriving it from the pool for older callers that don't.
	if req.Sideboard != nil {
		d.Sideboard = types.ExpandCounted(req.Sideboard)
	} else {
		d.Sideboard = types.DeriveSideboard(req.Pool, req.Mainboard)
	}
	d.Pool = nil
	return d
}

func ConfirmHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		player := r.PathValue("player")
		n := drafts.SeatNumber(player)
		if !ok || n == 0 {
			http.NotFound(rw, r)
			return
		}
		var req ConfirmRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		existing, err := draft.Deck(n)
		if err != nil {
			http.Error(rw, "deck not found: "+err.Error(), http.StatusNotFound)
			return
		}
		d := buildDeck(existing, req)
		if err := draft.SaveDeck(d); err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Mark the player confirmed in the session, if one exists. Take the same
		// lock as the autosave and background scan, since this is a load-modify-save
		// on the shared session file and would otherwise race with them.
		sessionSaveMu.Lock()
		defer sessionSaveMu.Unlock()
		if s, err := LoadSession(draft); err == nil {
			if pw := s.Players[player]; pw != nil {
				pw.Status = "confirmed"
				if err := s.Save(draft); err != nil {
					http.Error(rw, "Internal server error", http.StatusInternalServerError)
					return
				}
			}
		}
		rw.WriteHeader(http.StatusOK)
	})
}
