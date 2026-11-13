package decks

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// failingStore errors on every List.
type failingStore struct {
	storage.DeckStorage
}

func (failingStore) List(string, *storage.DecksRequest) ([]*storage.Deck, error) {
	return nil, errors.New("disk on fire")
}

func getDecks(h http.Handler, query string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/api/testcube/decks?"+query, nil)
	req.SetPathValue("cube", "testcube")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// emptyCube serves an empty list as today's.
type emptyCube struct{}

// Current returns an empty list.
func (emptyCube) Current(string) (*types.Cube, error) {
	return &types.Cube{}, nil
}

// Refresh returns an empty list.
func (emptyCube) Refresh(string) (*types.Cube, error) {
	return &types.Cube{}, nil
}

// TestDeckHandlerRulesErrorIs500 asks for a package in a cube with no rules
// saved, so they can't be read.
func TestDeckHandlerRulesErrorIs500(t *testing.T) {
	rec := getDecks(DeckHandler(newStore(), emptyCube{}), "match=package:graveyard")
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestDeckHandlerStoreErrorIs500(t *testing.T) {
	rec := getDecks(DeckHandler(failingStore{}, emptyCube{}), "")
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}
