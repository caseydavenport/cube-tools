package ocr

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// playerNum parses a photo folder name "pN" into the player's deck ID N.
func playerNum(short string) (int, bool) {
	n, err := strconv.Atoi(strings.TrimPrefix(short, "p"))
	if !strings.HasPrefix(short, "p") || err != nil || n < 1 || short != fmt.Sprintf("p%d", n) {
		return 0, false
	}
	return n, true
}

// discoverPlayers lists the players with a photo folder under the draft's
// img/, with their photos and the state of their deck and OCR work. A draft
// without photos gives nil.
func discoverPlayers(draft drafts.Draft) ([]PlayerDetail, error) {
	imgDir := filepath.Join(draft.Dir, "img")
	entries, err := os.ReadDir(imgDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	// The session (if any) tells us which players have OCR work saved, so we
	// can distinguish "in progress" from "unstarted". A missing or unreadable
	// session just means no work has been saved yet.
	sess, err := LoadSession(draft.Dir)
	if err != nil {
		sess = &Session{Players: map[string]*PlayerWork{}}
	}

	var out []PlayerDetail
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		short := e.Name()
		pd := PlayerDetail{ID: short}
		files, err := os.ReadDir(filepath.Join(imgDir, short))
		if err != nil {
			return nil, err
		}
		for _, f := range files {
			rel := "img/" + short + "/" + f.Name()
			switch {
			case strings.HasPrefix(f.Name(), "checkin-"):
				pd.Photos.Checkin = append(pd.Photos.Checkin, rel)
			case strings.HasPrefix(f.Name(), "checkout-"):
				pd.Photos.Checkout = append(pd.Photos.Checkout, rel)
			case strings.HasPrefix(f.Name(), "deck-"):
				pd.Photos.Deck = append(pd.Photos.Deck, rel)
			}
		}
		sort.Strings(pd.Photos.Checkin)
		sort.Strings(pd.Photos.Checkout)
		sort.Strings(pd.Photos.Deck)

		pw := sess.Players[short]
		if n, ok := playerNum(short); ok {
			if d, err := draft.Deck(n); err == nil {
				pd.Matches = d.Matches
				pd.PlayerID = d.PlayerID
				pd.HasDeck = len(d.Mainboard) > 0 || len(d.Pool) > 0
				if pd.HasDeck {
					pd.NeedsReconfirm = needsReconfirm(pw, d)
					pd.Warnings = deckWarnings(pw)
				}
			}
		}
		pd.Status = playerStatus(pw, pd.HasDeck)
		out = append(out, pd)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
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
				sess, err := LoadSession(draft.Dir)
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
