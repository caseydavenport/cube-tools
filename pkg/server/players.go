package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/sirupsen/logrus"
)

// PlayerInvalidator drops cached deck names after a rename. storage.Store
// implements it.
type PlayerInvalidator interface {
	InvalidatePlayers()
}

// PlayerNameRequest is the body of the add and rename routes.
type PlayerNameRequest struct {
	Name string `json:"name"`
}

// PlayersListHandler serves GET /api/players: the whole player list.
func PlayersListHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		l, err := players.Load(dataRoot)
		if err != nil {
			logrus.WithError(err).Error("Failed to load player list")
			http.Error(rw, "Internal server error", http.StatusInternalServerError)
			return
		}
		if l.Players == nil {
			l.Players = []players.Player{}
		}
		writePlayerJSON(rw, http.StatusOK, l)
	})
}

// PlayerAddHandler serves POST /api/players: it adds a player and returns it
// with 201, or 400 for an invalid name and 409 for a taken one.
func PlayerAddHandler(dataRoot string) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		var req PlayerNameRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		p, err := players.Add(dataRoot, req.Name)
		if writePlayerError(rw, err) {
			return
		}
		writePlayerJSON(rw, http.StatusCreated, p)
	})
}

// PlayerRenameHandler serves PATCH /api/players/{id}: it renames the player
// and drops cached deck names so the next read shows the new name.
func PlayerRenameHandler(dataRoot string, inv PlayerInvalidator) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(r.PathValue("id"))
		if err != nil || id <= 0 {
			http.NotFound(rw, r)
			return
		}
		var req PlayerNameRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(rw, "Invalid request", http.StatusBadRequest)
			return
		}
		p, err := players.Rename(dataRoot, id, req.Name)
		if writePlayerError(rw, err) {
			return
		}
		inv.InvalidatePlayers()
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
