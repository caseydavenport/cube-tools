package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/storage"
)

// PlayerStore reads and edits the global player list. storage.Store
// implements it, refusing edits when it is read-only.
type PlayerStore interface {
	Players() (*players.List, error)
	AddPlayer(name string) (players.Player, error)
	RenamePlayer(id int, name string) (players.Player, error)
	SetPlayerGroup(id int, group string) (players.Player, error)
}

var _ PlayerStore = &storage.Store{}

// playerNameRequest is the body of the add and rename routes.
type playerNameRequest struct {
	Name string `json:"name"`
}

// PlayersListHandler serves GET /api/players: the whole player list.
func PlayersListHandler(ps PlayerStore) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		l, err := ps.Players()
		if err != nil {
			logrus.WithError(err).Error("Failed to load player list")
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		writePlayerJSON(rw, http.StatusOK, l)
	})
}

// PlayerAddHandler serves POST /api/players: it adds a player and returns it
// with 201, or 400 for an invalid name and 409 for a taken one.
func PlayerAddHandler(ps PlayerStore) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		var req playerNameRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		p, err := ps.AddPlayer(req.Name)
		if writePlayerError(rw, err) {
			return
		}
		writePlayerJSON(rw, http.StatusCreated, p)
	})
}

// playerPatchRequest is the body of the update route. Each field present is
// changed; an empty group takes the player out of their play group.
type playerPatchRequest struct {
	Name  *string `json:"name"`
	Group *string `json:"group"`
}

// PlayerRenameHandler serves PATCH /api/players/{id}: it renames the player
// or sets their play group.
func PlayerRenameHandler(ps PlayerStore) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(r.PathValue("id"))
		if err != nil || id <= 0 {
			http.NotFound(rw, r)
			return
		}
		var req playerPatchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Name == nil && req.Group == nil) {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		var p players.Player
		if req.Name != nil {
			p, err = ps.RenamePlayer(id, *req.Name)
			if writePlayerError(rw, err) {
				return
			}
		}
		if req.Group != nil {
			p, err = ps.SetPlayerGroup(id, *req.Group)
			if writePlayerError(rw, err) {
				return
			}
		}
		writePlayerJSON(rw, http.StatusOK, p)
	})
}

// writePlayerError maps a player-list error to its HTTP status and writes it,
// reporting whether there was one.
func writePlayerError(rw http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, players.ErrInvalidName):
		http.Error(rw, err.Error(), http.StatusBadRequest)
	case errors.Is(err, players.ErrNameTaken):
		http.Error(rw, err.Error(), http.StatusConflict)
	case errors.Is(err, players.ErrUnknownPlayer):
		http.Error(rw, err.Error(), http.StatusNotFound)
	case errors.Is(err, storage.ErrReadOnly):
		http.Error(rw, "The player list is read-only", http.StatusForbidden)
	default:
		logrus.WithError(err).Error("Failed to update player list")
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
	}
	return true
}

// writePlayerJSON writes v as a JSON body with the given status.
func writePlayerJSON(rw http.ResponseWriter, status int, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(status)
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Warn("Failed to write player response")
	}
}
