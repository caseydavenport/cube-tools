package ocr

import (
	"encoding/json"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
)

type Session struct {
	DraftID int                    `json:"draft_id"`
	Players map[string]*PlayerWork `json:"players"`
}

type PlayerWork struct {
	Status string `json:"status"`

	// Boxes are the editable source of truth for a player's work: per-photo
	// OCR regions (detected or hand-drawn). The pool and mainboard lists are
	// derived from these on the client, so persisting them lets a reload
	// resume exactly where the user left off without re-running OCR.
	Boxes         map[string][]Box `json:"boxes,omitempty"`          // pool photo -> boxes
	DeckBoxes     map[string][]Box `json:"deck_boxes,omitempty"`     // deck photo -> boxes
	Overrides     map[string]int   `json:"overrides,omitempty"`      // manual pool counts
	DeckOverrides map[string]int   `json:"deck_overrides,omitempty"` // manual mainboard counts
	Sideboard     map[string]int   `json:"sideboard,omitempty"`      // hand-assigned sideboard counts
	Basics        map[string]int   `json:"basics,omitempty"`

	// PoolEntries/MainboardEntries are the derived lists at last save, kept so
	// the draft list can report progress without replaying the client logic.
	PoolEntries      []PoolEntry `json:"pool_entries,omitempty"`
	MainboardEntries []PoolEntry `json:"mainboard_entries,omitempty"`
}

// Box is one OCR region on a photo. Status is the confidence band
// ("high"/"low"/"very_low"/"unmatched") or "pending" while OCR runs.
type Box struct {
	ID         string             `json:"id"`
	Bbox       ocrpkg.Bbox        `json:"bbox"`
	Status     string             `json:"status"`
	Chosen     string             `json:"chosen,omitempty"`
	Candidates []ocrpkg.Candidate `json:"candidates,omitempty"`
}

type PoolEntry struct {
	CardName   string             `json:"card_name"`
	Count      int                `json:"count"`
	Source     Source             `json:"source"`
	Candidates []ocrpkg.Candidate `json:"candidates,omitempty"`
}

type Source struct {
	Photo string      `json:"photo"`
	Box   ocrpkg.Bbox `json:"box"`
}

// LoadSession reads the draft's saved working session. A missing session
// yields an empty one, not an error.
func LoadSession(draft drafts.Draft) (*Session, error) {
	data, err := draft.Session()
	if err != nil {
		return nil, err
	}
	if data == nil {
		return &Session{Players: map[string]*PlayerWork{}}, nil
	}
	var s Session
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	if s.Players == nil {
		s.Players = map[string]*PlayerWork{}
	}
	return &s, nil
}

// Save writes the session as the draft's working state.
func (s *Session) Save(draft drafts.Draft) error {
	data, err := json.MarshalIndent(s, "", " ")
	if err != nil {
		return err
	}
	return draft.SaveSession(data)
}
