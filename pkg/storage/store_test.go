package storage

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

type fakeBackend struct {
	decks []*Deck
}

func (f *fakeBackend) RawDecks(cube string) ([]*Deck, error) {
	out := make([]*Deck, len(f.decks))
	copy(out, f.decks)
	return out, nil
}

func TestStore_ListEnriches(t *testing.T) {
	alice := makeStorageDeck("Alice", 1, "2024-01-01", nil, []types.Match{{Opponent: "Bob", Wins: 2, Losses: 1}}, nil)
	bob := makeStorageDeck("Bob", 1, "2024-01-01", nil, []types.Match{{Opponent: "Alice", Wins: 1, Losses: 2}}, nil)

	s := NewStore(&fakeBackend{decks: []*Deck{alice, bob}})
	got, err := s.List("anycube", nil)
	assert.NoError(t, err)
	assert.Len(t, got, 2)

	var a *Deck
	for _, d := range got {
		if d.Player == "Alice" {
			a = d
		}
	}
	assert.NotNil(t, a)
	assert.Equal(t, 1, a.Stats.MatchWins)
}

func TestStore_WritesUnsupported(t *testing.T) {
	s := NewStore(&fakeBackend{})
	_, err := s.UpdateDeckMeta("c", DeckMetaWrite{DraftID: 1, DeckID: 1, MacroArchetype: "aggro"})
	assert.ErrorIs(t, err, ErrUnsupported)
	_, err = s.SaveDeckRecord("c", RecordEdit{DraftID: 1, DeckID: 1, Player: "x"})
	assert.ErrorIs(t, err, ErrUnsupported)
}
