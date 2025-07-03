package server

import (
	"encoding/json"
	"net/http"

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

func ArchetypesHandler() http.Handler {
	return &archetypesHandler{
		store: storage.NewFileDeckStore(),
	}
}

type archetypesHandler struct {
	store  storage.DeckStorage
	cached []storage.Deck
}

func (d *archetypesHandler) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	dr := params(r)
	logrus.WithField("params", dr).Info("/api/archetypes")

	// Get all of the decks from the store.
	resp := ArchetypesResponse{}
	decks, err := d.store.List(dr)
	if err != nil {
		panic(err)
	}

	// Go through each deck, and add up the win/loss counts for each archetype it faced.
	for _, deck := range decks {
		// Skip decks that don't have a draft ID.
		if deck.Metadata.DraftID == "" {
			continue
		}

		// Get the archetype of the current deck.
		arch := deckArch(deck)
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
			opponentArch := lookupOpponentDeck(decks, deck, game.Opponent)
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
			} else {
				versusData.Loss += 1
			}
		}
	}

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

func deckArch(d storage.Deck) string {
	for _, l := range d.Labels {
		switch l {
		case "aggro", "midrange", "control", "tempo":
			return l
		}
	}
	return ""
}

func lookupOpponentDeck(decks []storage.Deck, deck storage.Deck, opponent string) string {
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
		return deckArch(d)
	}
	return ""
}
