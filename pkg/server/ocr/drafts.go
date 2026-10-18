package ocr

import (
	"net/http"
	"path/filepath"
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// discoverPlayers lists the players with a photo folder under the draft's
// img/, in seat order, with their photos and the state of their deck and OCR
// work. A draft without photos gives nil.
func discoverPlayers(draft drafts.Draft) ([]PlayerDetail, error) {
	seats, err := draft.Photos()
	if err != nil || seats == nil {
		return nil, err
	}

	// The session (if any) tells us which players have OCR work saved, so we
	// can distinguish "in progress" from "unstarted". A missing or unreadable
	// session just means no work has been saved yet.
	sess, err := LoadSession(draft)
	if err != nil {
		sess = &Session{Players: map[string]*PlayerWork{}}
	}

	var out []PlayerDetail
	for _, seat := range seats {
		detail := PlayerDetail{ID: seat.Folder}
		detail.Photos.Checkin = seat.Checkin
		detail.Photos.Checkout = seat.Checkout
		detail.Photos.Deck = seat.Deck

		pw := sess.Players[seat.Folder]
		if seat.Seat != 0 {
			if d, err := draft.Deck(seat.Seat); err == nil {
				detail.Matches = d.Matches
				detail.PlayerID = d.PlayerID
				detail.HasDeck = len(d.Mainboard) > 0 || len(d.Pool) > 0
				if detail.HasDeck {
					detail.NeedsReconfirm = needsReconfirm(pw, d)
					detail.Warnings = deckWarnings(pw)
				}
			}
		}
		detail.Status = playerStatus(pw, detail.HasDeck)
		out = append(out, detail)
	}
	return out, nil
}

// playerStatus classifies a player's progress for the draft list indicator.
// "done" once their deck has been written (the confirm step), "in_progress"
// once any OCR work has been saved for them, else "unstarted".
func playerStatus(pw *PlayerWork, hasDeck bool) string {
	if hasDeck || (pw != nil && pw.Status == "confirmed") {
		return "done"
	}
	if pw != nil && (len(pw.Boxes) > 0 || len(pw.DeckBoxes) > 0 ||
		len(pw.PoolEntries) > 0 || len(pw.MainboardEntries) > 0 || len(pw.Basics) > 0) {
		return "in_progress"
	}
	return "unstarted"
}

func DraftsHandler() http.Handler { return DraftsHandlerWithRoot("data") }

func DraftsHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		all, err := drafts.List(filepath.Join(dataRoot, cube))
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		summaries := []DraftSummary{}

		// drafts.List is oldest first; the OCR list shows the newest first.
		for _, draft := range slices.Backward(all) {
			players, err := discoverPlayers(draft)
			if err != nil || len(players) == 0 {
				continue
			}
			confirmed, reconfirm, warned := 0, 0, 0
			for _, p := range players {
				if p.HasDeck {
					confirmed++
				}
				if p.NeedsReconfirm {
					reconfirm++
				}
				if len(p.Warnings) > 0 {
					warned++
				}
			}
			// Conflicts from the pool-vs-cube check, so the list can flag drafts
			// with OCR errors. A missing cube list or session just means no
			// conflicts to report rather than failing the whole listing.
			conflicts := 0
			if cl, err := loadCubeForDraft(dataRoot, cube, draft); err == nil {
				sess, err := LoadSession(draft)
				if err != nil {
					sess = &Session{Players: map[string]*PlayerWork{}}
				}
				conflicts = buildConsistencyReport(cl, sess, len(players)).Conflicts()
			}

			summaries = append(summaries, DraftSummary{
				Draft:           storage.NewDraftInfo(draft.DraftMetadata),
				Players:         len(players),
				Confirmed:       confirmed,
				Conflicts:       conflicts,
				ReconfirmNeeded: reconfirm,
				Warnings:        warned,
			})
		}
		writeJSON(rw, map[string]any{"drafts": summaries})
	})
}

func DraftDetailHandler() http.Handler { return DraftDetailHandlerWithRoot("data") }

func DraftDetailHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		players, err := discoverPlayers(draft)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		if players == nil {
			http.NotFound(rw, r)
			return
		}
		writeJSON(rw, DraftDetail{
			Draft:   storage.NewDraftInfo(draft.DraftMetadata),
			Players: players,
		})
	})
}
