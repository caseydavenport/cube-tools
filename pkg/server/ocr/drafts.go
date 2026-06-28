package ocr

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func isDraftDir(name string) bool {
	// YYYY-MM-DD_... — date prefix then an underscore.
	return len(name) >= 11 && name[4] == '-' && name[7] == '-' && name[10] == '_'
}

func readDraftMeta(dataRoot, cube, draftID string) *types.DraftMetadata {
	m, err := types.LoadDraftMetadata(filepath.Join(dataRoot, cube, draftID))
	if err != nil {
		return &types.DraftMetadata{}
	}
	return m
}

func discoverPlayers(dataRoot, cube, draftID string) ([]PlayerDetail, error) {
	imgDir := filepath.Join(dataRoot, cube, draftID, "img")
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
	sess, err := LoadSession(dataRoot, cube, draftID)
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
			rel := draftID + "/img/" + short + "/" + f.Name()
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
		deckPath := filepath.Join(dataRoot, cube, draftID, draftID+"-"+short+".json")
		if d, err := types.LoadDeck(deckPath); err == nil {
			pd.Matches = d.Matches
			pd.HasDeck = len(d.Mainboard) > 0 || len(d.Pool) > 0
			if pd.HasDeck {
				pd.NeedsReconfirm = needsReconfirm(pw, d)
				pd.Warnings = deckWarnings(pw)
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
		entries, err := os.ReadDir(filepath.Join(dataRoot, cube))
		if os.IsNotExist(err) {
			writeJSON(rw, map[string]any{"drafts": []DraftSummary{}})
			return
		}
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		var summaries []DraftSummary
		for _, e := range entries {
			if !e.IsDir() || !isDraftDir(e.Name()) {
				continue
			}
			draftID := e.Name()
			players, err := discoverPlayers(dataRoot, cube, draftID)
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
			if cl, err := loadCubeForDraft(dataRoot, cube, draftID); err == nil {
				sess, err := LoadSession(dataRoot, cube, draftID)
				if err != nil {
					sess = &Session{Players: map[string]*PlayerWork{}}
				}
				conflicts = buildConsistencyReport(cl, sess, len(players)).Conflicts()
			}

			meta := readDraftMeta(dataRoot, cube, draftID)
			summaries = append(summaries, DraftSummary{
				DraftID:         draftID,
				EventName:       meta.EventName,
				Flight:          meta.Flight,
				Players:         len(players),
				Confirmed:       confirmed,
				Conflicts:       conflicts,
				ReconfirmNeeded: reconfirm,
				Warnings:        warned,
			})
		}
		sort.Slice(summaries, func(i, j int) bool { return summaries[i].DraftID > summaries[j].DraftID })
		writeJSON(rw, map[string]any{"drafts": summaries})
	})
}

func DraftDetailHandler() http.Handler { return DraftDetailHandlerWithRoot("data") }

func DraftDetailHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		if cube == "" || draftID == "" || strings.ContainsAny(draftID, `/\`) || strings.Contains(draftID, "..") {
			http.NotFound(rw, r)
			return
		}
		players, err := discoverPlayers(dataRoot, cube, draftID)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		if players == nil {
			http.NotFound(rw, r)
			return
		}
		meta := readDraftMeta(dataRoot, cube, draftID)
		writeJSON(rw, DraftDetail{
			DraftID:   draftID,
			EventName: meta.EventName,
			Flight:    meta.Flight,
			Players:   players,
		})
	})
}
