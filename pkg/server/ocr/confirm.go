package ocr

import (
	"encoding/json"
	"net/http"
	"path/filepath"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// CountedCard aliases the shared type so existing OCR code and tests keep
// working while there is one underlying definition in pkg/types.
type CountedCard = types.CountedCard

type ConfirmRequest struct {
	Pool      []CountedCard  `json:"pool"`
	Mainboard []CountedCard  `json:"mainboard"`
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
	d.Sideboard = types.DeriveSideboard(req.Pool, req.Mainboard)
	d.Pool = nil
	return d
}

func ConfirmHandler() http.Handler { return ConfirmHandlerWithRoot("data") }

func ConfirmHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		player := r.PathValue("player")
		if cube == "" || !validDraftID(draftID) || player == "" || !validDraftID(player) {
			http.NotFound(rw, r)
			return
		}
		var req ConfirmRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		deckPath := filepath.Join(dataRoot, cube, draftID, draftID+"-"+player+".json")
		existing, err := types.LoadDeck(deckPath)
		if err != nil {
			http.Error(rw, "deck file not found: "+err.Error(), http.StatusNotFound)
			return
		}
		d := buildDeck(existing, req)
		if err := d.Save(deckPath); err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Mark the player confirmed in the session, if one exists. Take the same
		// lock as the autosave and background scan, since this is a load-modify-save
		// on the shared session file and would otherwise race with them.
		sessionSaveMu.Lock()
		defer sessionSaveMu.Unlock()
		if s, err := LoadSession(dataRoot, cube, draftID); err == nil {
			if pw := s.Players[player]; pw != nil {
				pw.Status = "confirmed"
				if err := s.Save(dataRoot, cube); err != nil {
					http.Error(rw, "Internal server error", http.StatusInternalServerError)
					return
				}
			}
		}
		rw.WriteHeader(http.StatusOK)
	})
}
