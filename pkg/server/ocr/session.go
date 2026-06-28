package ocr

import (
	"encoding/json"
	"os"
	"path/filepath"

	ocrpkg "github.com/caseydavenport/cube-tools/pkg/ocr"
)

const sessionFileName = ".ocr-session.json"

type Session struct {
	DraftID string                 `json:"draft_id"`
	Players map[string]*PlayerWork `json:"players"`
}

type PlayerWork struct {
	Status string `json:"status"`

	// Boxes are the editable source of truth for a player's work: per-photo
	// OCR regions (detected or hand-drawn). The pool and mainboard lists are
	// derived from these on the client, so persisting them lets a reload
	// resume exactly where the user left off without re-running OCR.
	Boxes     map[string][]Box `json:"boxes,omitempty"`      // pool photo -> boxes
	DeckBoxes map[string][]Box `json:"deck_boxes,omitempty"` // deck photo -> boxes
	Bonus     map[string]int   `json:"bonus,omitempty"`      // manual pool count deltas
	DeckBonus map[string]int   `json:"deck_bonus,omitempty"` // manual mainboard count deltas
	Basics    map[string]int   `json:"basics,omitempty"`

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

// LoadSession reads the working session for a draft. A missing file yields an
// empty session, not an error.
func LoadSession(dataRoot, cube, draftID string) (*Session, error) {
	path := filepath.Join(dataRoot, cube, draftID, sessionFileName)
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return &Session{DraftID: draftID, Players: map[string]*PlayerWork{}}, nil
	}
	if err != nil {
		return nil, err
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

// Save writes the session to data/<cube>/<draftID>/.ocr-session.json.
func (s *Session) Save(dataRoot, cube string) error {
	path := filepath.Join(dataRoot, cube, s.DraftID, sessionFileName)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", " ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
