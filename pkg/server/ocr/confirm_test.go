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
		Pool: []CountedCard{
			{Name: "Brainstorm", Count: 1},
			{Name: "Counterspell", Count: 1},
			{Name: "Misty Rainforest", Count: 2},
		},
		Mainboard: []CountedCard{
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
		Mainboard: []CountedCard{{Name: "Brainstorm", Count: 1}},
		Sideboard: []CountedCard{{Name: "Counterspell", Count: 2}},
	}
	d := buildDeck(types.NewDeck(), req)
	side := cardCounts(d.Sideboard)
	if side["Counterspell"] != 2 || len(side) != 1 {
		t.Fatalf("sideboard = %+v, want 2 Counterspell", side)
	}
}

func TestBuildDeckPoolOnly(t *testing.T) {
	req := ConfirmRequest{Pool: []CountedCard{{Name: "Brainstorm", Count: 1}, {Name: "Counterspell", Count: 1}}}
	d := buildDeck(types.NewDeck(), req)
	if len(d.Pool) != 2 {
		t.Fatalf("pool = %d, want 2", len(d.Pool))
	}
	if len(d.Mainboard) != 0 || len(d.Sideboard) != 0 {
		t.Fatalf("pool-only must leave main/side empty")
	}
}

func cardCounts(cs []types.Card) map[string]int {
	m := map[string]int{}
	for _, c := range cs {
		m[c.Name]++
	}
	return m
}

func TestConfirmFindsDeckByID(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})
	for id := 1; id <= 3; id++ {
		deck := types.NewDeck()
		deck.ID = id
		deck.PlayerID = id * 10
		writeDeck(t, d, deck)
	}

	h := ConfirmHandler(root)
	r := draftReq(t, "POST", "/players/p3/confirm", d)
	r.SetPathValue("player", "p3")
	r.Body = bodyOf(`{"pool":[{"name":"Brainstorm","count":1}]}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}
	got, err := types.LoadDeck(filepath.Join(d.Dir, "3.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Pool) != 1 || got.Pool[0].Name != "Brainstorm" {
		t.Fatalf("written pool = %+v", got.Pool)
	}
	if got.ID != 3 || got.PlayerID != 30 {
		t.Fatalf("deck = id %d player %d after confirm, want 3 and 30", got.ID, got.PlayerID)
	}
	other, err := types.LoadDeck(filepath.Join(d.Dir, "1.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(other.Pool) != 0 {
		t.Fatalf("deck 1 was written: %+v", other.Pool)
	}
}

func TestConfirmRejectsBadPlayer(t *testing.T) {
	root := t.TempDir()
	d := newDraft(t, root, types.DraftMetadata{})
	h := ConfirmHandler(root)
	for _, player := range []string{"casey", "p0", "p", "p1x", "../p1"} {
		r := draftReq(t, "POST", "/players/x/confirm", d)
		r.SetPathValue("player", player)
		r.Body = bodyOf(`{}`)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 404 {
			t.Errorf("player %q: status = %d, want 404", player, w.Code)
		}
	}
}
