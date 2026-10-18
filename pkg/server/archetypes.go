package server

import (
	"encoding/json"
	"net/http"

	"github.com/caseydavenport/cube-tools/pkg/server/deckquery"
	"github.com/caseydavenport/cube-tools/pkg/server/decks"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/sirupsen/logrus"
)

type ArchetypesResponse struct {
	Items []ArchetypeData `json:"items"`
}

type ArchetypeData struct {
	Name   string       `json:"name"`
	Versus []VersusData `json:"versus"`
}

type VersusData struct {
	Name string `json:"name"`
	Win  int    `json:"win"`
	Loss int    `json:"loss"`
}

func ArchetypesHandler(store storage.DeckStorage, edgesFor deckquery.EdgesLoader) http.Handler {
	return &archetypesHandler{q: deckquery.New(store, nil, edgesFor)}
}

type archetypesHandler struct {
	q *deckquery.Query
}

func (d *archetypesHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := decks.ParseDecksRequest(r)
	logrus.WithField("params", dr).Info("/api/archetypes")

	// Get all of the decks from the store.
	resp := ArchetypesResponse{}
	decks, err := d.q.Decks(CubeFromRequest(r), dr)
	if err != nil {
		logrus.WithError(err).Error("could not load decks")
		http.Error(rw, "could not load decks", http.StatusInternalServerError)
		return
	}

	// Go through each deck, and add up the win/loss counts for each archetype it faced.
	for _, deck := range decks {
		// Skip decks that don't have a draft ID.
		if deck.Metadata.DraftID == 0 {
			continue
		}

		// Get the archetype of the current deck.
		arch := deck.Macro()
		if arch == "" {
			continue // No archetype found, skip this deck.
		}

		// Find or create the archetype entry in the response.
		var archData *ArchetypeData
		for i := range resp.Items {
			if resp.Items[i].Name == arch {
				archData = &resp.Items[i]
				break
			}
		}
		if archData == nil {
			resp.Items = append(resp.Items, ArchetypeData{Name: arch})
			archData = &resp.Items[len(resp.Items)-1]
		}

		// Go through each game in the deck and count wins/losses against opponents.
		for _, game := range deck.Games {
			opponentArch := LookupOpponentMacro(decks, deck, game.Opponent)
			if opponentArch == "" {
				continue // No opponent deck found.
			}

			var versusData *VersusData
			for i := range archData.Versus {
				if archData.Versus[i].Name == opponentArch {
					versusData = &archData.Versus[i]
					break
				}
			}
			if versusData == nil {
				archData.Versus = append(archData.Versus, VersusData{Name: opponentArch})
				versusData = &archData.Versus[len(archData.Versus)-1]
			}

			if game.Winner == deck.Player {
				versusData.Win += 1
			} else if game.Winner != "" && !game.Tie {
				versusData.Loss += 1
			}
		}
	}

	// Marshal the response and write it back.
	b, err := json.Marshal(resp)
	if err != nil {
		http.Error(rw, "could not marshal response", http.StatusInternalServerError)
		return
	}
	if _, err := rw.Write(b); err != nil {
		logrus.WithError(err).Error("could not write archetypes response")
	}
}

func LookupOpponentMacro(decks []*storage.Deck, deck *storage.Deck, opponent string) string {
	for _, d := range decks {
		if d.Player != opponent {
			// Not the right player.
			continue
		}
		// Not the right draft.
		if deck.Metadata.DraftID != d.Metadata.DraftID {
			continue
		}

		// Return the archetype of the opponent deck, and the win/loss counts of the input deck.
		return d.Macro()
	}
	return ""
}
