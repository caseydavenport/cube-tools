package server

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
)

type DecksResponse struct {
	Decks []storage.Deck `json:"decks"`
}

func DeckHandler() http.Handler {
	return &deckHandler{
		store: storage.NewFileDeckStore(),
	}
}

type deckHandler struct {
	store  storage.DeckStorage
	cached []storage.Deck
}

func (d *deckHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := parseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/decks")

	resp := DecksResponse{}
	decks, err := d.store.List(dr)
	if err != nil {
		panic(err)
	}
	resp.Decks = decks

	// Marshal the response and write it back.
	b, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		panic(err)
	}
	_, err = rw.Write(b)
	if err != nil {
		panic(err)
	}
}

func parseDecksRequest(r *http.Request) *storage.DecksRequest {
	// Pull deck params from the request.
	p := storage.DecksRequest{}
	p.Player = getString(r, "player")
	p.Start = getString(r, "start")
	p.End = getString(r, "end")
	p.DraftSize = getInt(r, "size")
	return &p
}
