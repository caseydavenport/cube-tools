package memory

import (
	"encoding/json"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// SeedConformance seeds the canonical dataset storage.RunConformance checks:
// players Alice, Bob and Carol, and cube "conf" with draft 1, its two decks,
// its index and its draft log.
func SeedConformance(b *Backend) {
	b.SeedPlayers(players.Player{ID: 1, Name: "Alice"}, players.Player{ID: 2, Name: "Bob"}, players.Player{ID: 3, Name: "Carol"})
	alice := conformanceDeck("", 1, []types.Match{{
		Opponent: "Bob", OpponentID: 2, Round: 1, Wins: 2, Losses: 0, Winner: "Alice",
		Games: []types.Game{{Won: true}, {Won: true}},
	}})
	alice.PlayerID = 1
	bob := conformanceDeck("", 1, []types.Match{{
		Opponent: "Alice", OpponentID: 1, Round: 1, Wins: 0, Losses: 2, Winner: "Alice",
		Games: []types.Game{{}, {}},
	}})
	bob.PlayerID = 2
	b.Seed("conf", alice, bob)
	b.SeedIndex("conf", &storage.CubeIndex{
		Drafts: []storage.IndexedDraft{
			{
				DraftInfo: storage.DraftInfo{ID: 1, Date: "2024-01-01"},
				HasLog:    true,
				Decks:     []storage.IndexedDeck{{ID: 1}, {ID: 2}},
			},
		},
	})
	b.SeedDraftLog("conf", 1, json.RawMessage(`{"picks":[]}`))
}

// conformanceDeck builds a draft deck for the conformance dataset.
func conformanceDeck(player string, draft int, matches []types.Match) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = draft
	d.Date = "2024-01-01"
	d.Matches = matches
	return d
}
