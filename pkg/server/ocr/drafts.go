package ocr

import (
	"net/http"
	"path/filepath"
	"slices"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// PlayerSummary.Status values for the draft list indicator.
const (
	statusDone       = "done"
	statusInProgress = "in_progress"
	statusUnstarted  = "unstarted"
)

// draftsResponse is the body DraftsHandler writes.
type draftsResponse struct {
	Drafts []DraftSummary `json:"drafts"`
}

// discoverPlayers lists the players with a photo folder under the draft's
// img/, in seat order, with their photos and the state of their deck and OCR
// work. A draft without photos gives nil.
func discoverPlayers(draft drafts.Draft) ([]PlayerSummary, error) {
	seats, err := draft.Photos()
	if err != nil || seats == nil {
		return nil, err
	}

	// The session tells us which players have OCR work saved, to tell "in
	// progress" from "unstarted".
	session := loadSessionOrEmpty(draft)

	var summaries []PlayerSummary
	for _, seat := range seats {
		summary := PlayerSummary{ID: seat.Folder}
		summary.Photos.Checkin = seat.Checkin
		summary.Photos.Checkout = seat.Checkout
		summary.Photos.Deck = seat.Deck

		work := session.Players[seat.Folder]
		if seat.Seat != 0 {
			if deck, err := draft.Deck(seat.Seat); err == nil {
				summary.Matches = deck.Matches
				summary.PlayerID = deck.PlayerID
				summary.HasDeck = len(deck.Mainboard) > 0 || len(deck.Pool) > 0
				if summary.HasDeck {
					summary.NeedsReconfirm = needsReconfirm(work, deck)
					summary.Warnings = deckWarnings(work)
				}
			}
		}
		summary.Status = playerStatus(work, summary.HasDeck)
		summaries = append(summaries, summary)
	}
	return summaries, nil
}

// playerStatus classifies a player's progress for the draft list indicator.
// "done" once their deck has been written (the confirm step), "in_progress"
// once any OCR work has been saved for them, else "unstarted".
func playerStatus(work *PlayerWork, hasDeck bool) string {
	if hasDeck || (work != nil && work.Status == playerConfirmed) {
		return statusDone
	}
	if work != nil && (len(work.Boxes) > 0 || len(work.DeckBoxes) > 0 ||
		len(work.PoolCards) > 0 || len(work.MainboardCards) > 0 || len(work.Basics) > 0) {
		return statusInProgress
	}
	return statusUnstarted
}

// summarizeDraft counts a draft's players by state for the draft list. The
// conflict count comes from the pool-vs-cube check, so the list can flag drafts
// with OCR errors. A missing cube list or session just means no conflicts to
// report, rather than failing the whole listing.
func summarizeDraft(dataRoot, cube string, draft drafts.Draft, players []PlayerSummary) DraftSummary {
	summary := DraftSummary{
		Draft:   storage.NewDraftInfo(draft.DraftMetadata),
		Players: len(players),
	}
	for _, player := range players {
		if player.HasDeck {
			summary.Confirmed++
		}
		if player.NeedsReconfirm {
			summary.ReconfirmNeeded++
		}
		if len(player.Warnings) > 0 {
			summary.Warnings++
		}
	}
	if cubeList, err := loadCubeForDraft(dataRoot, cube, draft); err == nil {
		summary.Conflicts = buildConsistencyReport(cubeList, loadSessionOrEmpty(draft), len(players)).Conflicts()
	}
	return summary
}

// DraftsHandler lists the cube's drafts that have photos, newest first, with
// each one's player counts and OCR warnings.
func DraftsHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		all, err := drafts.List(filepath.Join(dataRoot, cube))
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		response := draftsResponse{Drafts: []DraftSummary{}}

		// drafts.List is oldest first; the OCR list shows the newest first.
		for _, draft := range slices.Backward(all) {
			players, err := discoverPlayers(draft)
			if err != nil || len(players) == 0 {
				continue
			}
			response.Drafts = append(response.Drafts, summarizeDraft(dataRoot, cube, draft, players))
		}
		writeJSON(rw, response)
	})
}

// DraftDetailHandler serves one draft with the summary of each player that has
// photos. It is 404 for an unknown draft or one without photos.
func DraftDetailHandler(dataRoot string) http.Handler {
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
		writeJSON(rw, DraftWithPlayers{
			Draft:   storage.NewDraftInfo(draft.DraftMetadata),
			Players: players,
		})
	})
}
