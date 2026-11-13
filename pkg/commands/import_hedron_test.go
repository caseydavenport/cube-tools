package commands

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestHedronPlayerNum(t *testing.T) {
	if got := hedronPlayerNum("Player 3"); got != 3 {
		t.Fatalf("hedronPlayerNum: want 3, got %d", got)
	}
	if got := hedronPlayerNum("Somebody"); got != 0 {
		t.Fatalf("hedronPlayerNum: want 0 for an unexpected shape, got %d", got)
	}
}

func TestImportHedronRefusesDuplicate(t *testing.T) {
	t.Chdir(t.TempDir())
	hedronDraft := &HedronDraft{DraftID: "h1", EventCode: "bcp26", EventName: "Boston", FlightName: "Saturday Morning", Date: "2026-06-20T10:00:00Z"}
	first, err := importDraft("polyverse", testCubeList, hedronDraft)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := importDraft("polyverse", testCubeList, hedronDraft); err == nil || !strings.Contains(err.Error(), fmt.Sprintf("draft %d", first)) {
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
	if _, err := importDraft("polyverse", testCubeList, &other); err != nil {
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
	id, err := importDraft("polyverse", testCubeList, hedronDraft)
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

func TestAddHedronMatchesSkipsShortResults(t *testing.T) {
	freddie, ozzy := types.NewDeck(), types.NewDeck()
	freddie.ID, ozzy.ID = 1, 2
	deckByPlayerID := map[string]*types.Deck{
		"Player 1": freddie,
		"Player 2": ozzy,
	}

	addHedronMatches(deckByPlayerID, []HedronMatch{
		{Round: 1, Player1ID: "Player 1", Player2ID: "Player 2", Result: []int{2}},
		{Round: 2, Player1ID: "Player 1", Player2ID: "Player 3", Result: []int{2, 0}},
		{Round: 3, Player1ID: "Player 1", Player2ID: "Player 2", IsBye: true},
	})
	if len(freddie.Matches) != 0 || len(ozzy.Matches) != 0 {
		t.Fatalf("matches = %+v and %+v, want none", freddie.Matches, ozzy.Matches)
	}

	addHedronMatches(deckByPlayerID, []HedronMatch{{Round: 4, Player1ID: "Player 1", Player2ID: "Player 2", Result: []int{2, 1, 1}}})
	if len(freddie.Matches) != 1 || freddie.Matches[0].Wins != 2 || freddie.Matches[0].Draws != 1 {
		t.Fatalf("freddie matches = %+v, want one 2-1-1", freddie.Matches)
	}
	if len(ozzy.Matches) != 1 || ozzy.Matches[0].Wins != 1 || ozzy.Matches[0].OpponentID != 1 {
		t.Fatalf("ozzy matches = %+v, want one 1-2-1 against deck 1", ozzy.Matches)
	}
}

func TestNumberHedronPlayersGivesOddIDsTheNextNumbers(t *testing.T) {
	got := numberHedronPlayers([]HedronPlayer{{ID: "Player 3"}, {ID: "Somebody"}, {ID: "Player 1"}})
	if got["Player 3"] != 3 || got["Player 1"] != 1 || got["Somebody"] != 4 {
		t.Fatalf("numbers = %v, want Player 3 -> 3, Player 1 -> 1, Somebody -> 4", got)
	}
}

func TestImportDraftRefusesShortDate(t *testing.T) {
	t.Chdir(t.TempDir())
	if _, err := importDraft("polyverse", testCubeList, &HedronDraft{DraftID: "h1", Date: "June"}); err == nil {
		t.Fatal("expected an error for a date that isn't YYYY-MM-DD")
	}
}

// serveHedron points Hedron Network requests at a test server that answers
// every request with body.
func serveHedron(t *testing.T, body string) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := w.Write([]byte(body)); err != nil {
			t.Errorf("write the search response: %v", err)
		}
	}))
	oldURL := hedronBaseURL
	hedronBaseURL = srv.URL
	t.Cleanup(func() {
		srv.Close()
		hedronBaseURL = oldURL
	})
}

func TestListHedronDrafts(t *testing.T) {
	serveHedron(t, `{"drafts": [{"draftId": "h1", "date": "2026-06-20T10:00:00Z"}]}`)
	got, err := ListHedronDrafts("polyversal")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].DraftID != "h1" {
		t.Fatalf("drafts = %+v, want h1", got)
	}
}

func TestImportHedronDraftUnknownDraftID(t *testing.T) {
	t.Chdir(t.TempDir())
	serveHedron(t, `{"drafts": [{"draftId": "h1", "date": "2026-06-20T10:00:00Z"}]}`)
	if _, err := ImportHedronDraft("polyverse", testCubeList, "polyversal", "nope"); err == nil || !strings.Contains(err.Error(), "nope") {
		t.Fatalf("err = %v, want one naming draft nope", err)
	}
}

func TestImportHedronDraftNoDrafts(t *testing.T) {
	serveHedron(t, `{"drafts": []}`)
	if _, err := ImportHedronDraft("polyverse", testCubeList, "polyversal", "h1"); err == nil {
		t.Fatal("expected an error when Hedron has no drafts for the cube")
	}
}
