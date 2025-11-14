package decks

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/server/query"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
)

type DecksResponse struct {
	Decks []*storage.Deck `json:"decks"`
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
	start := time.Now()

	dr := ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/decks")

	logrus.WithField("time", time.Since(start)).Info("Parse")
	resp := DecksResponse{}
	decks, err := d.store.List(dr)
	if err != nil {
		panic(err)
	}
	resp.Decks = decks
	logrus.WithField("time", time.Since(start)).Info("List")

	// Marshal the response and write it back.
	b, err := json.Marshal(resp)
	if err != nil {
		panic(err)
	}
	logrus.WithField("time", time.Since(start)).Info("Marshal")
	_, err = rw.Write(b)
	if err != nil {
		panic(err)
	}
	logrus.WithField("time", time.Since(start)).Info("Write")
}

func ParseDecksRequest(r *http.Request) *storage.DecksRequest {
	// Pull deck params from the request.
	p := storage.DecksRequest{}
	p.Player = query.GetString(r, "player")
	p.Start = query.GetString(r, "start")
	p.End = query.GetString(r, "end")
	p.DraftSize = query.GetInt(r, "size")
	return &p
}
