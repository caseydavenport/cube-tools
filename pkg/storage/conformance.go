package storage

import (
	"errors"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/stretchr/testify/assert"
)

// RunDeckConformance checks the deck-storage contract against a Store that the
// caller has already seeded with the canonical dataset: cube "conf" containing
// draft "d1" with Alice (id 1, 2-0 vs Bob in round 1, two games) and Bob (id 2,
// the mirror), each match carrying the opponent's id. caps controls which
// optional behaviors are exercised.
func RunDeckConformance(t *testing.T, s *Store, caps Capabilities) {
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

	if caps.WriteDecks {
		runAnnotationConformance(t, s)
		runRecordConformance(t, s)
	}

	RunRulesConformance(t, s, caps)
	RunIndexConformance(t, s)
	RunDraftLogConformance(t, s)
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

	updated, err := s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: "d1", DeckID: 1, MacroArchetype: "Aggro", Labels: []string{"fast"}})
	assert.NoError(t, err)
	assert.Equal(t, "Aggro", updated.MacroArchetype)
	assert.Equal(t, 1, updated.Stats.MatchWins)
	assert.Equal(t, "Aggro", deckByPlayer(t, s, "Alice").MacroArchetype)

	notes := "hi"
	_, err = s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: "d1", DeckID: 1, MacroArchetype: "Aggro", Notes: &notes})
	assert.NoError(t, err)
	assert.Equal(t, "hi", deckByPlayer(t, s, "Alice").Notes)

	_, err = s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: "d1", DeckID: 1, Labels: []string{"slow"}})
	assert.NoError(t, err)
	assert.Equal(t, "hi", deckByPlayer(t, s, "Alice").Notes)

	empty := ""
	_, err = s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: "d1", DeckID: 1, Notes: &empty})
	assert.NoError(t, err)
	assert.Equal(t, "", deckByPlayer(t, s, "Alice").Notes)

	_, err = s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: "d1", DeckID: 9})
	assert.ErrorIs(t, err, ErrDeckNotFound)
}

// runRecordConformance checks record edits: a rename keeps the deck's id and
// reaches the opponent, a name already in the draft is refused regardless of
// case, and the canonical fixture is restored afterward.
func runRecordConformance(t *testing.T, s *Store) {
	t.Helper()

	changed, err := s.SaveDeckRecord("conf", RecordEdit{DraftID: "d1", DeckID: 1, Player: "Alicia"})
	assert.NoError(t, err)
	assert.Len(t, changed, 2)
	alicia := deckByPlayer(t, s, "Alicia")
	assert.Equal(t, 1, alicia.ID)
	assert.Equal(t, 1, alicia.Matches[0].Round)
	assert.Len(t, alicia.Matches[0].Games, 2)
	bob := deckByPlayer(t, s, "Bob")
	assert.Equal(t, "Alicia", bob.Matches[0].Opponent)
	assert.Equal(t, 1, bob.Matches[0].OpponentID)
	assert.Len(t, bob.Matches[0].Games, 2)

	_, err = s.SaveDeckRecord("conf", RecordEdit{DraftID: "d1", DeckID: 1, Player: "bob"})
	assert.ErrorIs(t, err, ErrPlayerExists)

	_, err = s.SaveDeckRecord("conf", RecordEdit{DraftID: "d1", DeckID: 1, Player: "ALICIA"})
	assert.NoError(t, err)

	_, err = s.SaveDeckRecord("conf", RecordEdit{DraftID: "d1", DeckID: 9, Player: "x"})
	assert.ErrorIs(t, err, ErrDeckNotFound)

	_, err = s.SaveDeckRecord("conf", RecordEdit{DraftID: "d1", DeckID: 1, Player: "Alice"})
	assert.NoError(t, err)
	assert.Equal(t, "Alice", deckByPlayer(t, s, "Bob").Matches[0].Opponent)
}

// RunRulesConformance checks design-map rules round-tripping when caps.Rules
// is set: writing a small config and reading it back returns equal groups and
// links.
func RunRulesConformance(t *testing.T, s *Store, caps Capabilities) {
	t.Helper()
	if !caps.Rules {
		return
	}

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

// RunIndexConformance checks the read-only cube index against the canonical
// dataset's draft "d1" and its two decks. Index has no capability flag, so a
// backend that doesn't implement it is expected to return ErrUnsupported,
// which this skips rather than fails on.
func RunIndexConformance(t *testing.T, s *Store) {
	t.Helper()

	idx, err := s.Index("conf")
	if errors.Is(err, ErrUnsupported) {
		return
	}
	if !assert.NoError(t, err) {
		return
	}

	assert.Len(t, idx.Drafts, 1)
	draft := idx.Drafts[0]
	assert.Equal(t, "d1", draft.DraftID)
	assert.True(t, draft.HasLog)
	assert.ElementsMatch(t, []IndexedDeck{{ID: 1}, {ID: 2}}, draft.Decks)
}

// RunDraftLogConformance checks that a seeded draft log round-trips through
// GetDraftLog. Like Index, GetDraftLog has no capability flag; a backend that
// doesn't implement it is expected to return ErrUnsupported, which this skips
// rather than fails on.
func RunDraftLogConformance(t *testing.T, s *Store) {
	t.Helper()

	got, err := s.GetDraftLog("conf", "d1")
	if errors.Is(err, ErrUnsupported) {
		return
	}
	assert.NoError(t, err)
	assert.JSONEq(t, `{"picks":[]}`, string(got))
}
