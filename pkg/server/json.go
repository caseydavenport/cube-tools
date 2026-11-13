package server

import (
	"encoding/json"
	"net/http"

	"github.com/sirupsen/logrus"
)

// writeJSON writes v as a JSON body with the given status. A value that can't
// be marshaled gets a 500 instead, and a failed write is logged, since the
// client has gone by then.
func writeJSON(rw http.ResponseWriter, status int, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		logrus.WithError(err).Error("Failed to marshal response")
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(status)
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Warn("Failed to write response")
	}
}
