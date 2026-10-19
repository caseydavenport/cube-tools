package httperr

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

func TestWriteStoreError(t *testing.T) {
	for err, want := range map[error]int{
		storage.ErrReadOnly:                         http.StatusForbidden,
		storage.ErrUnsupported:                      http.StatusNotFound,
		storage.ErrDeckNotFound:                     http.StatusNotFound,
		storage.ErrPlayerExists:                     http.StatusConflict,
		storage.ErrUnknownPlayer:                    http.StatusBadRequest,
		fmt.Errorf("save: %w", storage.ErrReadOnly): http.StatusForbidden,
		errors.New("disk on fire"):                  http.StatusInternalServerError,
	} {
		rec := httptest.NewRecorder()
		assert.True(t, WriteStoreError(rec, err, "test"), err.Error())
		assert.Equal(t, want, rec.Code, err.Error())
	}
}

func TestWriteStoreErrorNil(t *testing.T) {
	rec := httptest.NewRecorder()
	assert.False(t, WriteStoreError(rec, nil, "test"))
	assert.Equal(t, http.StatusOK, rec.Code)
}
