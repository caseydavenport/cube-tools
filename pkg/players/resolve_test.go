package players

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func rockList() *List {
	return &List{Players: []Player{{ID: 1, Name: "Freddie"}, {ID: 2, Name: "Ozzy"}}}
}

func TestResolveDraftFillsNames(t *testing.T) {
	freddie := &types.Deck{ID: 1, PlayerID: 1, Matches: []types.Match{
		{OpponentID: 2, Wins: 2, Losses: 1, Games: []types.Game{{Won: true}, {}, {Won: true}}},
		{OpponentID: 3, Wins: 1, Losses: 1, Draws: 1},
	}}
	ozzy := &types.Deck{ID: 2, PlayerID: 2, Matches: []types.Match{{OpponentID: 1, Wins: 1, Losses: 2}}}
	seat := &types.Deck{ID: 3, Matches: []types.Match{{OpponentID: 1, Wins: 1, Losses: 1, Draws: 1, Games: []types.Game{{Tie: true}}}}}

	rockList().ResolveDraft([]*types.Deck{freddie, ozzy, seat})

	assert.Equal(t, "Freddie", freddie.Player)
	assert.Equal(t, "Ozzy", ozzy.Player)
	assert.Equal(t, "p3", seat.Player)

	m := freddie.Matches[0]
	assert.Equal(t, "Ozzy", m.Opponent)
	assert.Equal(t, 2, m.OpponentPlayerID)
	assert.Equal(t, "Freddie", m.Winner)
	assert.Equal(t, []types.Game{
		{Opponent: "Ozzy", Winner: "Freddie", Won: true},
		{Opponent: "Ozzy", Winner: "Ozzy"},
		{Opponent: "Ozzy", Winner: "Freddie", Won: true},
	}, m.Games)

	assert.Equal(t, "p3", freddie.Matches[1].Opponent)
	assert.Equal(t, 0, freddie.Matches[1].OpponentPlayerID)
	assert.Equal(t, "", freddie.Matches[1].Winner)
	assert.Equal(t, "Freddie", ozzy.Matches[0].Winner)
	assert.Equal(t, []types.Game{{Opponent: "Freddie", Tie: true}}, seat.Matches[0].Games)
}

func TestResolveDraftKeepsPresetName(t *testing.T) {
	d := &types.Deck{ID: 1, Player: "cc-user"}
	rockList().ResolveDraft([]*types.Deck{d})
	assert.Equal(t, "cc-user", d.Player)
}

func TestResolveDraftUnknownID(t *testing.T) {
	d := &types.Deck{ID: 1, PlayerID: 9}
	rockList().ResolveDraft([]*types.Deck{d})
	assert.Equal(t, "player #9", d.Player)
}

func TestResolveDraftNilList(t *testing.T) {
	a := &types.Deck{ID: 1, Matches: []types.Match{{OpponentID: 2, Wins: 2}}}
	b := &types.Deck{ID: 2}
	var l *List
	l.ResolveDraft([]*types.Deck{a, b})
	assert.Equal(t, "p1", a.Player)
	assert.Equal(t, "p2", a.Matches[0].Opponent)
}

func TestSeatLabel(t *testing.T) {
	assert.Equal(t, "p7", SeatLabel(7))
}

func TestResolveDraftUsesSeat(t *testing.T) {
	seat := &types.Deck{ID: 2, Seat: 5}
	named := &types.Deck{ID: 3, Seat: 6, PlayerID: 1, Matches: []types.Match{{OpponentID: 2, Wins: 2}}}
	rockList().ResolveDraft([]*types.Deck{seat, named})
	assert.Equal(t, "p5", seat.Player)
	assert.Equal(t, "Freddie", named.Player)
	assert.Equal(t, "p5", named.Matches[0].Opponent)
}
