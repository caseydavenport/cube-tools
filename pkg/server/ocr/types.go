package ocr

import (
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// PhotoSet lists a player's photo paths, relative to the draft: the check-in and
// check-out pool photos and the deck photos.
type PhotoSet struct {
	Checkin  []string `json:"checkin"`
	Checkout []string `json:"checkout"`
	Deck     []string `json:"deck"`
}

// PlayerSummary is one player's row on the draft page: their photos, deck and
// OCR progress, and any problems found in their saved work.
type PlayerSummary struct {
	ID string `json:"id"`

	// PlayerID is the player the seat's deck is assigned to, zero while it is
	// still an anonymous seat.
	PlayerID int           `json:"player_id,omitempty"`
	Photos   PhotoSet      `json:"photos"`
	Matches  []types.Match `json:"matches"`
	HasDeck  bool          `json:"has_deck"`

	// Status is the progress indicator for the player list:
	// "done" (deck confirmed), "in_progress" (OCR work saved), or "unstarted".
	Status string `json:"status"`

	// NeedsReconfirm is set when a confirmed deck is stale: the live session
	// pool differs from what was written, so the deck should be rebuilt.
	NeedsReconfirm bool `json:"needs_reconfirm"`

	// Warnings are cross-check problems with a confirmed deck (pool/mainboard
	// sizes, cards in the deck but not the pool), mirroring the workspace checks.
	Warnings []string `json:"warnings,omitempty"`
}

// DraftWithPlayers is a draft's details and the summary of each player with
// photos, in seat order.
type DraftWithPlayers struct {
	Draft   storage.DraftInfo `json:"draft"`
	Players []PlayerSummary   `json:"players"`
}

// DraftSummary is one row of the OCR draft list: the draft's details and counts
// of its players by state.
type DraftSummary struct {
	Draft     storage.DraftInfo `json:"draft"`
	Players   int               `json:"players"`
	Confirmed int               `json:"confirmed"`

	// Conflicts is the number of over-count/unknown discrepancies from the
	// pool-vs-cube check, surfaced as a warning badge on the draft list.
	Conflicts int `json:"conflicts"`

	// ReconfirmNeeded counts confirmed players whose deck is stale, and Warnings
	// counts confirmed players with cross-check problems. Both drive draft-list
	// badges so a draft's trouble is visible without opening it.
	ReconfirmNeeded int `json:"reconfirm_needed"`
	Warnings        int `json:"warnings"`
}

// Breakdown sums a player's mainboard for the review page: every card with
// basics included, the lands among them, and the basics alone.
type Breakdown struct {
	Cards  int `json:"cards"`
	Lands  int `json:"lands"`
	Basics int `json:"basics"`
}

// PlayerReview is what the review page shows about a player's cards: the
// warnings and the mainboard breakdown. It's computed per response, never
// saved.
type PlayerReview struct {
	Warnings  []string  `json:"warnings"`
	Breakdown Breakdown `json:"breakdown"`
}
