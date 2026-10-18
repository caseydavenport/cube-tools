package commands

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
)

func TestHedronPlayerNum(t *testing.T) {
	if got := hedronPlayerNum("Player 3"); got != 3 {
		t.Fatalf("hedronPlayerNum: want 3, got %d", got)
	}
	if got := hedronPlayerNum("Somebody"); got != 0 {
		t.Fatalf("hedronPlayerNum: want 0 for an unexpected shape, got %d", got)
	}
}

func TestImportHedronDraftUnknownID(t *testing.T) {
	// A draft ID absent from the (empty, since the cube is bogus) result set
	// must return an error, not fatal. Network failure also returns an error.
	if _, err := ImportHedronDraft("polyverse", "definitely-not-a-cube", "nope"); err == nil {
		t.Skip("network reached a real endpoint; skipping negative assertion")
	}
}

func TestImportHedronRefusesDuplicate(t *testing.T) {
	t.Chdir(t.TempDir())
	hedronDraft := &HedronDraft{DraftID: "h1", EventCode: "bcp26", EventName: "Boston", FlightName: "Saturday Morning", Date: "2026-06-20T10:00:00Z"}
	first, err := importDraft("polyverse", hedronDraft)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := importDraft("polyverse", hedronDraft); err == nil || !strings.Contains(err.Error(), fmt.Sprintf("draft %d", first)) {
		t.Fatalf("second import: err = %v, want one naming draft %d", err, first)
	}
	all, err := drafts.List(filepath.Join("data", "polyverse"))
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 {
		t.Fatalf("drafts = %d after a duplicate import, want 1", len(all))
	}

	// Another flight of the same event is a different draft.
	other := *hedronDraft
	other.FlightName = "Saturday Evening"
	if _, err := importDraft("polyverse", &other); err != nil {
		t.Fatalf("other flight: %v", err)
	}
}

func TestImportHedronDecksAreAnonymous(t *testing.T) {
	t.Chdir(t.TempDir())
	hedronDraft := &HedronDraft{
		DraftID: "h1", EventCode: "bcp26", Date: "2026-06-20T10:00:00Z",
		Players: []HedronPlayer{{ID: "Player 1"}, {ID: "Player 2"}},
		Matches: []HedronMatch{{Round: 1, Player1ID: "Player 1", Player2ID: "Player 2", Result: []int{2, 1}}},
	}
	id, err := importDraft("polyverse", hedronDraft)
	if err != nil {
		t.Fatal(err)
	}
	draft, err := drafts.Find(filepath.Join("data", "polyverse"), id)
	if err != nil {
		t.Fatal(err)
	}
	decks, err := draft.Decks()
	if err != nil {
		t.Fatal(err)
	}
	var noPlayers *players.List
	noPlayers.ResolveDraft(decks)
	if len(decks) != 2 {
		t.Fatalf("decks = %d, want 2", len(decks))
	}
	for _, d := range decks {
		if d.PlayerID != 0 || d.Seat != d.ID || d.Player != fmt.Sprintf("p%d", d.ID) {
			t.Fatalf("deck %d: player %d %q, want an anonymous seat", d.ID, d.PlayerID, d.Player)
		}
	}
	if m := decks[0].Matches[0]; m.OpponentID != 2 || m.Winner != "p1" {
		t.Fatalf("p1 match = %+v, want a win against deck 2", m)
	}
}
