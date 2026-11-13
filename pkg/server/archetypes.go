package server

import (
	"net/http"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ArchetypesResponse is the body of GET /api/{cube}/archetypes: one record
// per archetype that has a deck in the selected decks.
type ArchetypesResponse struct {
	Items []ArchetypeRecord `json:"items"`
}

// ArchetypeRecord is one archetype's game record against each archetype it
// faced.
type ArchetypeRecord struct {
	Name   string          `json:"name"`
	Versus []MatchupRecord `json:"versus"`
}

// MatchupRecord is the games an archetype won and lost against one opposing
// archetype. Draws count toward neither.
type MatchupRecord struct {
	Name string `json:"name"`
	Win  int    `json:"win"`
	Loss int    `json:"loss"`
}

// ArchetypesHandler serves each archetype's win/loss record against every other
// archetype, over the decks the request's filters select. src answers
// package: terms through the cube's rules.
func ArchetypesHandler(store storage.DeckStorage, src types.CubeSource) http.Handler {
	return &archetypesHandler{q: deckquery.New(store, src)}
}

type archetypesHandler struct {
	q *deckquery.Query
}

// ServeHTTP tallies every selected deck's games by the archetype of the deck
// and of its opponent, and answers with the totals.
func (d *archetypesHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/archetypes")

	cubeDecks, err := d.q.Decks(CubeFromRequest(r), dr)
	if err != nil {
		logrus.WithError(err).Error("could not load decks")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Go through each deck, and add up the win/loss counts for each archetype it faced.
	resp := ArchetypesResponse{Items: []ArchetypeRecord{}}
	for _, deck := range cubeDecks {
		// A deck with no draft can't be matched to its opponents.
		if deck.Metadata.DraftID == 0 {
			continue
		}
		arch := deck.Macro()
		if arch == "" {
			continue
		}
		record := recordFor(&resp.Items, arch)

		for _, game := range deck.Games {
			opponentArch := lookupOpponentMacro(cubeDecks, deck, game.Opponent)
			if opponentArch == "" {
				continue
			}
			matchup := matchupFor(&record.Versus, opponentArch)
			if game.Winner == deck.Player {
				matchup.Win++
			} else if game.Winner != "" && !game.Tie {
				matchup.Loss++
			}
		}
	}

	writeJSON(rw, http.StatusOK, resp)
}

// recordFor returns the entry in items for the named archetype, appending an
// empty one when there is none. The pointer is valid until items grows again.
func recordFor(items *[]ArchetypeRecord, name string) *ArchetypeRecord {
	for i := range *items {
		if (*items)[i].Name == name {
			return &(*items)[i]
		}
	}
	*items = append(*items, ArchetypeRecord{Name: name})
	return &(*items)[len(*items)-1]
}

// matchupFor returns the entry in versus for the named opposing archetype,
// appending an empty one when there is none. The pointer is valid until versus
// grows again.
func matchupFor(versus *[]MatchupRecord, name string) *MatchupRecord {
	for i := range *versus {
		if (*versus)[i].Name == name {
			return &(*versus)[i]
		}
	}
	*versus = append(*versus, MatchupRecord{Name: name})
	return &(*versus)[len(*versus)-1]
}

// lookupOpponentMacro returns the archetype of the deck that player opponent
// brought to the same draft as deck, or "" when no such deck is in candidates.
func lookupOpponentMacro(candidates []*storage.Deck, deck *storage.Deck, opponent string) string {
	for _, d := range candidates {
		if d.Player != opponent {
			continue
		}
		if deck.Metadata.DraftID != d.Metadata.DraftID {
			continue
		}
		return d.Macro()
	}
	return ""
}
