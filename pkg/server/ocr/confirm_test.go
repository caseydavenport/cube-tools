package ocr

import (
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestBuildDeckDerivesSideboardAndBasics(t *testing.T) {
	existing := types.NewDeck()
	existing.Player = "0001-p3"
	existing.Matches = []types.Match{{Opponent: "x", Wins: 2, Losses: 1}}

	req := ConfirmRequest{
		Pool: []types.CountedCard{
			{Name: "Brainstorm", Count: 1},
			{Name: "Counterspell", Count: 1},
			{Name: "Misty Rainforest", Count: 2},
		},
		Mainboard: []types.CountedCard{
			{Name: "Brainstorm", Count: 1},
			{Name: "Misty Rainforest", Count: 2},
		},
		Basics: map[string]int{"Island": 7},
	}
	d := buildDeck(existing, req)

	if len(d.Pool) != 0 {
		t.Fatalf("pool should be empty when mainboard present, got %d", len(d.Pool))
	}
	main := cardCounts(d.Mainboard)
	if main["Brainstorm"] != 1 || main["Misty Rainforest"] != 2 || main["Island"] != 7 {
		t.Fatalf("mainboard counts = %+v", main)
	}
	side := cardCounts(d.Sideboard)
	if side["Counterspell"] != 1 || len(side) != 1 {
		t.Fatalf("sideboard = %+v, want just 1 Counterspell", side)
	}
	if len(d.Matches) != 1 {
		t.Fatalf("matches must be preserved, got %d", len(d.Matches))
	}
}

func TestBuildDeckExplicitSideboard(t *testing.T) {
	// A deck-only scan has no pool, so the sideboard can't be derived. The
	// client sends it explicitly and buildDeck must trust it.
	req := ConfirmRequest{
		Mainboard: []types.CountedCard{{Name: "Brainstorm", Count: 1}},
		Sideboard: []types.CountedCard{{Name: "Counterspell", Count: 2}},
	}
	d := buildDeck(types.NewDeck(), req)
	side := cardCounts(d.Sideboard)
	if side["Counterspell"] != 2 || len(side) != 1 {
		t.Fatalf("sideboard = %+v, want 2 Counterspell", side)
	}
}

func TestBuildDeckPoolOnly(t *testing.T) {
	req := ConfirmRequest{Pool: []types.CountedCard{{Name: "Brainstorm", Count: 1}, {Name: "Counterspell", Count: 1}}}
	d := buildDeck(types.NewDeck(), req)
	if len(d.Pool) != 2 {
		t.Fatalf("pool = %d, want 2", len(d.Pool))
	}
	if len(d.Mainboard) != 0 || len(d.Sideboard) != 0 {
		t.Fatalf("pool-only must leave main/side empty")
	}
}

func cardCounts(cards []types.Card) map[string]int {
	numCopiesByName := map[string]int{}
	for _, card := range cards {
		numCopiesByName[card.Name]++
	}
	return numCopiesByName
}

func TestConfirmFindsDeckByID(t *testing.T) {
	root := t.TempDir()
	draft := newDraft(t, root, types.DraftMetadata{})
	for id := 1; id <= 3; id++ {
		deck := types.NewDeck()
		deck.ID = id
		deck.PlayerID = id * 10
		writeDeck(t, draft, deck)
	}

	h := ConfirmHandler(root)
	r := draftReq(t, "POST", "/players/p3/confirm", draft)
	r.SetPathValue("player", "p3")
	r.Body = bodyOf(`{"pool":[{"name":"Brainstorm","count":1}]}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}
	got, err := types.LoadDeck(filepath.Join(draft.Dir, "3.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Pool) != 1 || got.Pool[0].Name != "Brainstorm" {
		t.Fatalf("written pool = %+v", got.Pool)
	}
	if got.ID != 3 || got.PlayerID != 30 {
		t.Fatalf("deck = id %d player %d after confirm, want 3 and 30", got.ID, got.PlayerID)
	}
	other, err := types.LoadDeck(filepath.Join(draft.Dir, "1.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(other.Pool) != 0 {
		t.Fatalf("deck 1 was written: %+v", other.Pool)
	}
}

func TestConfirmMarksOnlyThatPlayerConfirmed(t *testing.T) {
	root := t.TempDir()
	draft := newDraft(t, root, types.DraftMetadata{})
	for _, id := range []int{1, 2} {
		deck := types.NewDeck()
		deck.ID = id
		writeDeck(t, draft, deck)
	}
	session := &Session{DraftID: draft.ID, Players: map[string]*PlayerWork{
		"p1": {Status: "in_progress"},
		"p2": {Status: "in_progress"},
	}}
	if err := session.Save(draft); err != nil {
		t.Fatal(err)
	}

	r := draftReq(t, "POST", "/players/p2/confirm", draft)
	r.SetPathValue("player", "p2")
	r.Body = bodyOf(`{"pool":[{"name":"Brainstorm","count":1}]}`)
	w := httptest.NewRecorder()
	ConfirmHandler(root).ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}

	got, err := LoadSession(draft)
	if err != nil {
		t.Fatal(err)
	}
	if got.Players["p2"].Status != playerConfirmed {
		t.Fatalf("p2 status = %q, want %q", got.Players["p2"].Status, playerConfirmed)
	}
	if got.Players["p1"].Status != "in_progress" {
		t.Fatalf("p1 status = %q, want it left in_progress", got.Players["p1"].Status)
	}
}

func TestConfirmRejectsBadPlayer(t *testing.T) {
	root := t.TempDir()
	draft := newDraft(t, root, types.DraftMetadata{})
	h := ConfirmHandler(root)
	for _, player := range []string{"casey", "p0", "p", "p1x", "../p1"} {
		r := draftReq(t, "POST", "/players/x/confirm", draft)
		r.SetPathValue("player", player)
		r.Body = bodyOf(`{}`)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 404 {
			t.Errorf("player %q: status = %d, want 404", player, w.Code)
		}
	}
}
