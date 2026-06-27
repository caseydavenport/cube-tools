package ocr

import "github.com/caseydavenport/cube-tools/pkg/types"

type PhotoSet struct {
	Checkin  []string `json:"checkin"`
	Checkout []string `json:"checkout"`
	Deck     []string `json:"deck"`
}

type PlayerDetail struct {
	ID      string        `json:"id"`
	Photos  PhotoSet      `json:"photos"`
	Matches []types.Match `json:"matches"`
	HasDeck bool          `json:"has_deck"`

	// Status is the progress indicator for the player list:
	// "done" (deck confirmed), "in_progress" (OCR work saved), or "unstarted".
	Status string `json:"status"`

	// NeedsReconfirm is set when a confirmed deck is stale: the live session
	// pool no longer matches what was written, so the deck should be rebuilt.
	NeedsReconfirm bool `json:"needs_reconfirm"`

	// Warnings are cross-check problems with a confirmed deck (pool/mainboard
	// sizes, cards in the deck but not the pool), mirroring the workspace checks.
	Warnings []string `json:"warnings,omitempty"`
}

type DraftDetail struct {
	DraftID   string         `json:"draft_id"`
	EventName string         `json:"event_name"`
	Flight    string         `json:"flight,omitempty"`
	Players   []PlayerDetail `json:"players"`
}

type DraftSummary struct {
	DraftID   string `json:"draft_id"`
	EventName string `json:"event_name"`
	Flight    string `json:"flight,omitempty"`
	Players   int    `json:"players"`
	Confirmed int    `json:"confirmed"`

	// Conflicts is the number of over-count/unknown discrepancies from the
	// pool-vs-cube check, surfaced as a warning badge on the draft list.
	Conflicts int `json:"conflicts"`

	// ReconfirmNeeded counts confirmed players whose deck is stale, and Warnings
	// counts confirmed players with cross-check problems. Both drive draft-list
	// badges so a draft's trouble is visible without opening it.
	ReconfirmNeeded int `json:"reconfirm_needed"`
	Warnings        int `json:"warnings"`
}

type CardInfo struct {
	Name      string `json:"name"`
	MaxCopies int    `json:"max_copies"`
	IsLand    bool   `json:"is_land"`
}
