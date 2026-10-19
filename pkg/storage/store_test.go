package storage

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
	"github.com/stretchr/testify/assert"
)

// fakeBackend serves fixed decks. Methods it doesn't define panic through the
// nil embedded Backend, so a test that reaches one fails loudly.
type fakeBackend struct {
	Backend
	decks    []*Deck
	readOnly bool
}

func (f *fakeBackend) Writable(string) bool { return !f.readOnly }

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

func TestStoreWritesRefuseReadOnlyCube(t *testing.T) {
	s := NewStore(&fakeBackend{readOnly: true})
	assert.False(t, s.Writable("c"))
	_, err := s.UpdateDeckMeta("c", DeckMetaWrite{DraftID: 1, DeckID: 1, MacroArchetype: "aggro"})
	assert.ErrorIs(t, err, ErrReadOnly)
	id := 1
	_, err = s.SaveDeckRecord("c", RecordEdit{DraftID: 1, DeckID: 1, PlayerID: &id})
	assert.ErrorIs(t, err, ErrReadOnly)
	assert.ErrorIs(t, s.PutRules("c", nil), ErrReadOnly)
}

// rosterSource is a fixed player list for Store tests.
type rosterSource struct{}

// Players returns Freddie (1) and Ozzy (2).
func (rosterSource) Players() (*players.List, error) {
	return &players.List{Players: []players.Player{{ID: 1, Name: "Freddie"}, {ID: 2, Name: "Ozzy"}}}, nil
}

func TestStoreResolvesNames(t *testing.T) {
	freddie := &Deck{}
	freddie.ID, freddie.PlayerID, freddie.Metadata.DraftID = 1, 1, 1
	freddie.Matches = []types.Match{{OpponentID: 2, Wins: 2, Losses: 1}}
	ozzy := &Deck{}
	ozzy.ID, ozzy.PlayerID, ozzy.Metadata.DraftID = 2, 2, 1
	ozzy.Matches = []types.Match{{OpponentID: 1, Wins: 1, Losses: 2}}
	other := &Deck{}
	other.ID, other.PlayerID, other.Metadata.DraftID = 2, 1, 2

	s := NewStore(&fakeBackend{decks: []*Deck{freddie, ozzy, other}}, WithPlayers(rosterSource{}))
	got, err := s.List("c", nil)
	assert.NoError(t, err)
	assert.Equal(t, "Freddie", got[0].Player)
	assert.Equal(t, "Ozzy", got[0].Matches[0].Opponent)
	assert.Equal(t, "Freddie", got[0].Matches[0].Winner)
	assert.Equal(t, 1, got[0].Stats.MatchWins)
	assert.Equal(t, "Ozzy", got[1].Player)
	assert.Equal(t, 1, got[1].Stats.MatchLosses)
	assert.Equal(t, "Freddie", got[2].Player)
}

func TestPersonLabel(t *testing.T) {
	seat := func(draft int) *Deck {
		d := &Deck{}
		d.ID, d.Player, d.Metadata.DraftID = 3, "p3", draft
		return d
	}
	assert.True(t, seat(1).IsAnonymous())
	moved := seat(1)
	moved.ID, moved.Seat = 2, 3
	assert.True(t, moved.IsAnonymous(), "the seat number, not the deck ID, names the seat")
	assert.Equal(t, "p3 (draft 1)", seat(1).PersonLabel())
	assert.NotEqual(t, seat(1).PersonLabel(), seat(2).PersonLabel())

	named := &Deck{}
	named.ID, named.PlayerID, named.Player = 3, 7, "Joan Jett"
	assert.False(t, named.IsAnonymous())
	assert.Equal(t, "Joan Jett", named.PersonLabel())

	remote := &Deck{}
	remote.ID, remote.Player = 3, "cc-user"
	assert.False(t, remote.IsAnonymous())
	assert.Equal(t, "cc-user", remote.PersonLabel())
}
