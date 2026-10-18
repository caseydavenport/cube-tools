package decks

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/graph"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/stretchr/testify/assert"
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

func TestDeckHandlerEdgeErrorIs500(t *testing.T) {
	edges := func(string) ([]graph.Edge, error) { return nil, errors.New("no rules") }
	rec := getDecks(DeckHandler(newStore(), edges), "match=community:graveyard")
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestDeckHandlerStoreErrorIs500(t *testing.T) {
	rec := getDecks(DeckHandler(failingStore{}, nil), "")
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}
