package ocr

import (
	"encoding/json"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
)

// PlayerWork.Status value for a player whose deck has been written by the
// confirm step.
const playerConfirmed = "confirmed"

// Box.Status values besides the confidence bands: "pending" while OCR runs and
// "unmatched" when no card name fit the region.
const (
	boxPending   = "pending"
	boxUnmatched = "unmatched"
)

// Session is a draft's saved OCR working state: each player's boxes, counts
// and lists, keyed by seat folder ("p3"). It lives in the draft's session file
// so a reload resumes where the operator left off.
type Session struct {
	DraftID int                    `json:"draft_id"`
	Players map[string]*PlayerWork `json:"players"`
}

// PlayerWork is one player's saved work: the OCR boxes, the manual counts
// edited on top of them, and the card lists derived from both.
type PlayerWork struct {
	Status string `json:"status"`

	// Boxes and DeckBoxes hold the OCR regions, detected or hand-drawn, per
	// pool photo and deck photo. The client derives the card lists from them,
	// so a reload resumes without re-running OCR.
	Boxes     map[string][]Box `json:"boxes,omitempty"`
	DeckBoxes map[string][]Box `json:"deck_boxes,omitempty"`

	// Overrides and DeckOverrides are hand-edited card counts for the pool and
	// mainboard, and Sideboard holds hand-assigned sideboard counts.
	Overrides     map[string]int `json:"overrides,omitempty"`
	DeckOverrides map[string]int `json:"deck_overrides,omitempty"`
	Sideboard     map[string]int `json:"sideboard,omitempty"`
	Basics        map[string]int `json:"basics,omitempty"`

	// PoolCards and MainboardCards are the derived lists at last save, kept so
	// the draft list can report progress without replaying the client logic.
	PoolCards      []ScannedCard `json:"pool_entries,omitempty"`
	MainboardCards []ScannedCard `json:"mainboard_entries,omitempty"`
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

// ScannedCard is a card name with a copy count, and the photo box it was read
// from, in a player's saved pool or mainboard list.
type ScannedCard struct {
	CardName   string             `json:"card_name"`
	Count      int                `json:"count"`
	Source     Source             `json:"source"`
	Candidates []ocrpkg.Candidate `json:"candidates,omitempty"`
}

// Source is where a scanned card was read: a photo path relative to the draft
// and the region within it.
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

// loadSessionOrEmpty is LoadSession for read-only views: an unreadable session
// is logged and shown as an empty one, so a corrupt file doesn't hide the draft.
func loadSessionOrEmpty(draft drafts.Draft) *Session {
	session, err := LoadSession(draft)
	if err != nil {
		logrus.WithError(err).WithField("draft", draft.ID).Warn("Could not load OCR session, treating it as empty")
		return &Session{Players: map[string]*PlayerWork{}}
	}
	return session
}

// Save writes the session as the draft's working state.
func (s *Session) Save(draft drafts.Draft) error {
	data, err := json.MarshalIndent(s, "", " ")
	if err != nil {
		return err
	}
	return draft.SaveSession(data)
}
