package storage

import (
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/stretchr/testify/assert"
)

// RunConformance checks the storage contract against a Store seeded with the
// canonical dataset: players Alice (1), Bob (2) and Carol (3); cube "conf"
// with draft 1 holding Alice's deck (id 1, 2-0 vs Bob in round 1, two games)
// and Bob's (id 2, the mirror). readOnlyCube names a cube the backend refuses
// writes to, or is empty when the backend has none.
func RunConformance(t *testing.T, s *Store, readOnlyCube string) {
	t.Helper()

	decks, err := s.List("conf", nil)
	assert.NoError(t, err)
	assert.Len(t, decks, 2)

	byPlayer := map[string]*Deck{}
	for _, d := range decks {
		byPlayer[d.Player] = d
	}
	assert.NotNil(t, byPlayer["Alice"])
	assert.NotNil(t, byPlayer["Bob"])
	assert.Equal(t, 1, byPlayer["Alice"].ID)
	assert.Equal(t, 2, byPlayer["Bob"].ID)
	assert.Equal(t, 1, byPlayer["Alice"].Stats.MatchWins)
	assert.Equal(t, 1, byPlayer["Bob"].Stats.MatchLosses)
	assert.Len(t, byPlayer["Alice"].Games, 2)

	filtered, err := s.List("conf", &DecksRequest{Player: "Alice"})
	assert.NoError(t, err)
	assert.Len(t, filtered, 1)
	assert.Equal(t, "Alice", filtered[0].Player)

	assert.True(t, s.Writable("conf"))
	runAnnotationConformance(t, s)
	runRecordConformance(t, s)
	runRulesConformance(t, s)
	runIndexConformance(t, s)
	runDraftLogConformance(t, s)
	if readOnlyCube != "" {
		runReadOnlyConformance(t, s, readOnlyCube)
	}
}

// runReadOnlyConformance checks that every write to a read-only cube is
// refused with ErrReadOnly.
func runReadOnlyConformance(t *testing.T, s *Store, cube string) {
	t.Helper()
	assert.False(t, s.Writable(cube))

	_, err := s.UpdateDeckMeta(cube, DeckMetaWrite{DraftID: 1, DeckID: 1, MacroArchetype: "Aggro"})
	assert.ErrorIs(t, err, ErrReadOnly)
	playerID := 1
	_, err = s.SaveDeckRecord(cube, RecordEdit{DraftID: 1, DeckID: 1, PlayerID: &playerID})
	assert.ErrorIs(t, err, ErrReadOnly)
	assert.ErrorIs(t, s.PutRules(cube, &design.DesignMapConfig{}), ErrReadOnly)
}

// deckByPlayer lists the cube and returns the named player's deck, failing the
// test if it isn't there.
func deckByPlayer(t *testing.T, s *Store, player string) *Deck {
	t.Helper()
	decks, err := s.List("conf", nil)
	assert.NoError(t, err)
	for _, d := range decks {
		if d.Player == player {
			return d
		}
	}
	t.Fatalf("no deck for player %q", player)
	return nil
}

// runAnnotationConformance checks annotation writes: fields land on the deck
// without disturbing its record, and a write that doesn't mention notes keeps
// them.
func runAnnotationConformance(t *testing.T, s *Store) {
	t.Helper()

	updated, err := s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: 1, DeckID: 1, MacroArchetype: "Aggro", Labels: []string{"fast"}})
	assert.NoError(t, err)
	assert.Equal(t, "Aggro", updated.MacroArchetype)
	assert.Equal(t, 1, updated.Stats.MatchWins)
	assert.Equal(t, "Aggro", deckByPlayer(t, s, "Alice").MacroArchetype)

	notes := "hi"
	_, err = s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: 1, DeckID: 1, MacroArchetype: "Aggro", Notes: &notes})
	assert.NoError(t, err)
	assert.Equal(t, "hi", deckByPlayer(t, s, "Alice").Notes)

	_, err = s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: 1, DeckID: 1, Labels: []string{"slow"}})
	assert.NoError(t, err)
	assert.Equal(t, "hi", deckByPlayer(t, s, "Alice").Notes)

	empty := ""
	_, err = s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: 1, DeckID: 1, Notes: &empty})
	assert.NoError(t, err)
	assert.Equal(t, "", deckByPlayer(t, s, "Alice").Notes)

	_, err = s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: 1, DeckID: 9})
	assert.ErrorIs(t, err, ErrDeckNotFound)
}

// runRecordConformance checks player assignment: reassigning keeps the deck's
// id and record and reaches the opponent's view without rewriting it, a player
// already in the draft or missing from the list is refused, an anonymous deck
// shows its seat label, and the canonical fixture is restored afterward.
func runRecordConformance(t *testing.T, s *Store) {
	t.Helper()
	assign := func(deckID, playerID int) ([]*Deck, error) {
		return s.SaveDeckRecord("conf", RecordEdit{DraftID: 1, DeckID: deckID, PlayerID: &playerID})
	}

	changed, err := assign(1, 3)
	assert.NoError(t, err)
	assert.Len(t, changed, 1)
	carol := deckByPlayer(t, s, "Carol")
	assert.Equal(t, 1, carol.ID)
	assert.Equal(t, 3, carol.PlayerID)
	assert.Equal(t, 1, carol.Matches[0].Round)
	assert.Len(t, carol.Matches[0].Games, 2)
	assert.Equal(t, 1, carol.Stats.MatchWins)
	bob := deckByPlayer(t, s, "Bob")
	assert.Equal(t, "Carol", bob.Matches[0].Opponent)
	assert.Equal(t, 3, bob.Matches[0].OpponentPlayerID)
	assert.Equal(t, "Carol", bob.Matches[0].Winner)
	assert.Len(t, bob.Matches[0].Games, 2)

	_, err = assign(1, 2)
	assert.ErrorIs(t, err, ErrPlayerExists)

	_, err = assign(1, 99)
	assert.ErrorIs(t, err, ErrUnknownPlayer)

	_, err = assign(9, 3)
	assert.ErrorIs(t, err, ErrDeckNotFound)

	_, err = assign(1, 0)
	assert.NoError(t, err)
	seat := deckByPlayer(t, s, "p1")
	assert.Equal(t, 0, seat.PlayerID)
	assert.Equal(t, "p1", deckByPlayer(t, s, "Bob").Matches[0].Opponent)

	_, err = assign(1, 1)
	assert.NoError(t, err)
	assert.Equal(t, "Alice", deckByPlayer(t, s, "Bob").Matches[0].Opponent)
}

// runRulesConformance checks that a small design-map config written and read
// back returns equal groups and links.
func runRulesConformance(t *testing.T, s *Store) {
	t.Helper()

	rules := &design.DesignMapConfig{
		Groups: []design.Group{{Name: "Aggro"}},
		Links:  []design.Link{{Label: "combo"}},
	}
	assert.NoError(t, s.PutRules("conf", rules))

	got, err := s.GetRules("conf")
	assert.NoError(t, err)
	assert.Equal(t, rules.Groups, got.Groups)
	assert.Equal(t, rules.Links, got.Links)
}

// runIndexConformance checks the cube index against the canonical dataset's
// draft 1 and its two decks.
func runIndexConformance(t *testing.T, s *Store) {
	t.Helper()

	idx, err := s.Index("conf")
	if !assert.NoError(t, err) {
		return
	}

	assert.Len(t, idx.Drafts, 1)
	draft := idx.Drafts[0]
	assert.Equal(t, 1, draft.ID)
	assert.True(t, draft.HasLog)
	assert.ElementsMatch(t, []IndexedDeck{{ID: 1}, {ID: 2}}, draft.Decks)
}

// runDraftLogConformance checks that the seeded draft log round-trips.
func runDraftLogConformance(t *testing.T, s *Store) {
	t.Helper()

	got, err := s.GetDraftLog("conf", 1)
	assert.NoError(t, err)
	assert.JSONEq(t, `{"picks":[]}`, string(got))
}
