package ocr

import (
	"encoding/json"
	"maps"
	"net/http"
	"sync"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/server"
)

// sessionSaveMu serializes the load-merge-write in SessionSaveHandler. The
// client autosaves one player at a time, so concurrent saves for different
// players would otherwise race on the shared session file and lose work.
var sessionSaveMu sync.Mutex

func SessionGetHandler() http.Handler { return SessionGetHandlerWithRoot("data") }

func SessionGetHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		s, err := LoadSession(draft)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		writeJSON(rw, withReviews(dataRoot, server.CubeFromRequest(r), draft, s, s.Players))
	})
}

func SessionSaveHandler() http.Handler { return SessionSaveHandlerWithRoot("data") }

func SessionSaveHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		var posted Session
		if err := json.NewDecoder(r.Body).Decode(&posted); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}

		sessionSaveMu.Lock()
		defer sessionSaveMu.Unlock()

		// Merge the posted players into what's already on disk rather than
		// replacing the file. The client sends only the player it's editing, so
		// a full replace would wipe every other player's saved work.
		s, err := LoadSession(draft)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}

		// Trust the path, not the body.
		s.DraftID = draft.ID
		maps.Copy(s.Players, posted.Players)
		if err := s.Save(draft); err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		writeJSON(rw, withReviews(dataRoot, server.CubeFromRequest(r), draft, s, posted.Players))
	})
}

// sessionResponse is a session as the client reads it: the saved work plus each
// player's review, which is computed per response and never saved.
type sessionResponse struct {
	*Session
	Reviews map[string]PlayerReview `json:"reviews"`
}

// withReviews pairs the session with the reviews of the given players.
func withReviews(dataRoot, cube string, draft drafts.Draft, s *Session, players map[string]*PlayerWork) sessionResponse {
	lands := cubeLands(dataRoot, cube, draft)
	out := sessionResponse{Session: s, Reviews: map[string]PlayerReview{}}
	for id := range players {
		if pw := s.Players[id]; pw != nil {
			out.Reviews[id] = reviewPlayer(pw, lands)
		}
	}
	return out
}

// cubeLands flags which of the draft's cube cards are lands. Without a cube, no
// card counts as a land rather than failing the request.
func cubeLands(dataRoot, cube string, draft drafts.Draft) map[string]bool {
	lands := map[string]bool{}
	cl, err := loadCubeForDraft(dataRoot, cube, draft)
	if err != nil {
		logrus.WithError(err).Warn("no cube for OCR review land counts")
		return lands
	}
	for _, name := range cl.Names() {
		lands[name] = isLandCard(name)
	}
	return lands
}
