package storage

import (
	"errors"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/design"
	"github.com/stretchr/testify/assert"
)

// RunDeckConformance checks the deck-storage contract against a Store that the
// caller has already seeded with the canonical dataset: cube "conf" containing
// draft "d1" with Alice (2-0 vs Bob) and Bob (0-2 vs Alice). caps controls which
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
	assert.Equal(t, 1, byPlayer["Alice"].Stats.MatchWins)
	assert.Equal(t, 1, byPlayer["Bob"].Stats.MatchLosses)
	assert.Len(t, byPlayer["Alice"].Games, 2)

	filtered, err := s.List("conf", &DecksRequest{Player: "Alice"})
	assert.NoError(t, err)
	assert.Len(t, filtered, 1)
	assert.Equal(t, "Alice", filtered[0].Player)

	if caps.WriteMeta {
		updated, err := s.UpdateDeckMeta("conf", DeckMetaWrite{DraftID: "d1", DeckID: "Alice", MacroArchetype: "Aggro", Labels: []string{"fast"}})
		assert.NoError(t, err)
		assert.Equal(t, "Aggro", updated.MacroArchetype)
		assert.Equal(t, 1, updated.Stats.MatchWins)

		reread, err := s.List("conf", nil)
		assert.NoError(t, err)
		for _, d := range reread {
			if d.Player == "Alice" {
				assert.Equal(t, "Aggro", d.MacroArchetype)
			}
		}
	}

	RunNotesConformance(t, s, caps)
	RunRulesConformance(t, s, caps)
	RunIndexConformance(t, s)
	RunDraftLogConformance(t, s)
}

// RunNotesConformance checks deck-notes round-tripping when caps.Notes is set:
// writing then reading a deck's notes returns the same content, and reading an
// unknown deck's notes returns ("", nil) rather than an error.
func RunNotesConformance(t *testing.T, s *Store, caps Capabilities) {
	t.Helper()
	if !caps.Notes {
		return
	}

	assert.NoError(t, s.PutNotes("conf", "d1", "Alice", "hi"))
	got, err := s.GetNotes("conf", "d1", "Alice")
	assert.NoError(t, err)
	assert.Equal(t, "hi", got)

	got, err = s.GetNotes("conf", "d1", "Nobody")
	assert.NoError(t, err)
	assert.Equal(t, "", got)
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
	assert.ElementsMatch(t, []IndexedDeck{{ID: "Alice"}, {ID: "Bob"}}, draft.Decks)
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
