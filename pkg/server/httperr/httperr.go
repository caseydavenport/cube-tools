// Package httperr turns storage errors into HTTP responses, so every handler
// answers the same error with the same status.
package httperr

import (
	"errors"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
)

// WriteStoreError writes the response for a storage error and reports whether
// there was one. Errors it doesn't recognize are logged with msg and answered
// with a 500.
func WriteStoreError(rw http.ResponseWriter, err error, msg string) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, storage.ErrReadOnly):
		http.Error(rw, "This cube is read-only", http.StatusForbidden)
	case errors.Is(err, storage.ErrUnsupported):
		http.Error(rw, "Not available for this cube", http.StatusNotFound)
	case errors.Is(err, storage.ErrDeckNotFound):
		http.Error(rw, "Deck not found", http.StatusNotFound)
	case errors.Is(err, storage.ErrPlayerExists):
		http.Error(rw, "That player already has a deck in this draft", http.StatusConflict)
	case errors.Is(err, storage.ErrUnknownPlayer):
		http.Error(rw, "Unknown player", http.StatusBadRequest)
	default:
		logrus.WithError(err).Error(msg)
		http.Error(rw, "Internal server error", http.StatusInternalServerError)
	}
	return true
}
