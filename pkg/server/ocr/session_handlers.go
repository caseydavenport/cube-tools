package ocr

import (
	"encoding/json"
	"maps"
	"net/http"
	"sync"

	"github.com/caseydavenport/cube-tools/pkg/server"
)

// sessionSaveMu serializes the load-merge-write in SessionSaveHandler. The
// client autosaves one player at a time, so concurrent saves for different
// players would otherwise race on the shared session file and lose work.
var sessionSaveMu sync.Mutex

func SessionGetHandler() http.Handler { return SessionGetHandlerWithRoot("data") }

func SessionGetHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		if cube == "" || !validDraftID(draftID) {
			http.NotFound(rw, r)
			return
		}
		s, err := LoadSession(dataRoot, cube, draftID)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		writeJSON(rw, s)
	})
}

func SessionSaveHandler() http.Handler { return SessionSaveHandlerWithRoot("data") }

func SessionSaveHandlerWithRoot(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		cube := server.CubeFromRequest(r)
		draftID := r.PathValue("draft_id")
		if cube == "" || !validDraftID(draftID) {
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
		s, err := LoadSession(dataRoot, cube, draftID)
		if err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		s.DraftID = draftID // trust the path, not the body
		maps.Copy(s.Players, posted.Players)
		if err := s.Save(dataRoot, cube); err != nil {
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		rw.WriteHeader(http.StatusOK)
	})
}
