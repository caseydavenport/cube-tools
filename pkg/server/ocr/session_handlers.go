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

// SessionGetHandler serves the draft's saved OCR session with a review of each
// player's lists. A draft with no saved session gets an empty one.
func SessionGetHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		draft, ok := draftFromRequest(dataRoot, r)
		if !ok {
			http.NotFound(rw, r)
			return
		}
		session, err := LoadSession(draft)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		writeJSON(rw, withReviews(cubeLands(dataRoot, server.CubeFromRequest(r), draft), session, session.Players))
	})
}

// SessionSaveHandler merges the posted players into the draft's saved session
// and returns it with a review of each posted player. The draft id comes from
// the URL, not the body.
func SessionSaveHandler(dataRoot string) http.Handler {
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

		// The cube can come from CubeCobra, so load it before taking the lock
		// rather than making every other save wait on the network.
		lands := cubeLands(dataRoot, server.CubeFromRequest(r), draft)

		sessionSaveMu.Lock()
		defer sessionSaveMu.Unlock()

		// Merge the posted players into what's already on disk rather than
		// replacing the file. The client sends only the player it's editing, so
		// a full replace would wipe every other player's saved work.
		session, err := LoadSession(draft)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		session.DraftID = draft.ID
		maps.Copy(session.Players, posted.Players)
		if err := session.Save(draft); err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		writeJSON(rw, withReviews(lands, session, posted.Players))
	})
}

// sessionResponse is a session as the client reads it: the saved work plus each
// player's review, which is computed per response and never saved.
type sessionResponse struct {
	*Session
	Reviews map[string]PlayerReview `json:"reviews"`
}

// withReviews pairs the session with the reviews of the given players, using
// lands to tell which cards are lands.
func withReviews(lands map[string]bool, session *Session, players map[string]*PlayerWork) sessionResponse {
	out := sessionResponse{Session: session, Reviews: map[string]PlayerReview{}}
	for id := range players {
		if work := session.Players[id]; work != nil {
			out.Reviews[id] = reviewPlayer(work, lands)
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
		lands[name] = server.IsLand(name)
	}
	return lands
}
