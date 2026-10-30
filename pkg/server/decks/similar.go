package decks

import (
	"cmp"
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/storage"
)

const (
	// minSharedCards is how many non-basic mainboard cards another deck must
	// share before it counts as like this one: about a third of a deck's spells.
	minSharedCards = 8

	// similarDecksLimit caps how many decks the endpoint returns.
	similarDecksLimit = 5
)

// manaOrder is the order a deck's colors are listed in.
var manaOrder = []string{"W", "U", "B", "R", "G"}

// SimilarDeck is one deck that shares many cards with the requested deck,
// with what the Decks page needs to show and link to it.
type SimilarDeck struct {
	DraftID   int      `json:"draft_id"`
	ID        int      `json:"id"`
	Player    string   `json:"player"`
	Date      string   `json:"date"`
	Event     string   `json:"event"`
	Archetype string   `json:"macro_archetype"`
	Colors    []string `json:"colors"`
	Shared    int      `json:"shared"`
	Wins      int      `json:"match_wins"`
	Losses    int      `json:"match_losses"`
	Draws     int      `json:"match_draws"`
}

// SimilarDecksResponse is the body of GET /api/{cube}/decks/similar.
type SimilarDecksResponse struct {
	Decks []SimilarDeck `json:"decks"`
}

// SimilarDecksHandler serves the decks most like one deck, named by the deck
// query parameter as "<draft_id>/<id>". It compares against every deck in the
// cube, ignoring date ranges and filters, so the list is the same everywhere.
func SimilarDecksHandler(store storage.DeckStorage) http.Handler {
	return &similarDecksHandler{store: store}
}

type similarDecksHandler struct {
	store storage.DeckStorage
}

// ServeHTTP answers with the requested deck's most similar decks: 400 for a
// malformed deck reference, 404 for a deck the cube doesn't have.
func (h *similarDecksHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	draftID, id, ok := parseDeckRef(r.URL.Query().Get("deck"))
	if !ok {
		http.Error(rw, "deck must be <draft_id>/<id>", http.StatusBadRequest)
		return
	}

	all, err := h.store.List(r.PathValue("cube"), &storage.DecksRequest{})
	if err != nil {
		logrus.WithError(err).Error("could not load decks")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}
	i := slices.IndexFunc(all, func(d *storage.Deck) bool {
		return d.Metadata.DraftID == draftID && d.ID == id
	})
	if i < 0 {
		http.Error(rw, "deck not found", http.StatusNotFound)
		return
	}

	b, err := json.Marshal(SimilarDecksResponse{Decks: similarDecks(all[i], all, similarDecksLimit)})
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write similar decks response")
	}
}

// parseDeckRef splits "<draft_id>/<id>" into its two numbers, reporting false
// when it isn't in that form.
func parseDeckRef(ref string) (int, int, bool) {
	draft, deck, found := strings.Cut(ref, "/")
	if !found {
		return 0, 0, false
	}
	draftID, err := strconv.Atoi(draft)
	if err != nil {
		return 0, 0, false
	}
	id, err := strconv.Atoi(deck)
	if err != nil {
		return 0, 0, false
	}
	return draftID, id, true
}

// similarDecks ranks the decks sharing at least minSharedCards distinct
// non-basic mainboard cards with target: most shared first, then newer, then
// player name. The target itself is left out, and at most limit come back.
func similarDecks(target *storage.Deck, all []*storage.Deck, limit int) []SimilarDeck {
	targetCards := spellNames(target)
	rows := []SimilarDeck{}
	for _, d := range all {
		if d.Metadata.DraftID == target.Metadata.DraftID && d.ID == target.ID {
			continue
		}
		shared := 0
		for name := range spellNames(d) {
			if targetCards[name] {
				shared++
			}
		}
		if shared < minSharedCards {
			continue
		}
		rows = append(rows, similarRow(d, shared))
	}

	slices.SortFunc(rows, func(a, b SimilarDeck) int {
		if a.Shared != b.Shared {
			return b.Shared - a.Shared
		}
		if a.Date != b.Date {
			return cmp.Compare(b.Date, a.Date)
		}
		return cmp.Compare(a.Player, b.Player)
	})
	if len(rows) > limit {
		rows = rows[:limit]
	}
	return rows
}

// spellNames is the set of the deck's distinct non-basic mainboard card names.
func spellNames(d *storage.Deck) map[string]bool {
	names := map[string]bool{}
	for _, c := range d.Mainboard {
		if !c.IsBasicLand() {
			names[c.Name] = true
		}
	}
	return names
}

// similarRow describes one deck for the similar-decks list.
func similarRow(d *storage.Deck, shared int) SimilarDeck {
	colors := []string{}
	deckColors := d.GetColors()
	for _, c := range manaOrder {
		if deckColors[c] {
			colors = append(colors, c)
		}
	}
	return SimilarDeck{
		DraftID:   d.Metadata.DraftID,
		ID:        d.ID,
		Player:    d.Player,
		Date:      d.Date,
		Event:     d.Draft.EventName,
		Archetype: d.MacroArchetype,
		Colors:    colors,
		Shared:    shared,
		Wins:      d.Stats.MatchWins,
		Losses:    d.Stats.MatchLosses,
		Draws:     d.Stats.MatchDraws,
	}
}
