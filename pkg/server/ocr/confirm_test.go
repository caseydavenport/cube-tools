package ocr

import (
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

func TestBuildDeckDerivesSideboardAndBasics(t *testing.T) {
	existing := types.NewDeck()
	existing.Player = "2026-01-17_evt_1-p3"
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

func TestConfirmHandlerWritesDeckFile(t *testing.T) {
	root := t.TempDir()
	draftID := "2026-01-17_evt_1"
	deckPath := filepath.Join(root, "polyverse", draftID, draftID+"-p3.json")
	writeFile(t, deckPath,
		`{"metadata":{"draft_id":"`+draftID+`","path":"`+deckPath+`"},"player":"`+draftID+`-p3","date":"2026-01-17","labels":[],"matches":[],"mainboard":[],"sideboard":[]}`)

	h := ConfirmHandlerWithRoot(root)
	r := reqWithCube(t, "POST", "/api/polyverse/ocr/drafts/"+draftID+"/players/p3/confirm", "polyverse")
	r.SetPathValue("draft_id", draftID)
	r.SetPathValue("player", "p3")
	r.Body = bodyOf(`{"pool":[{"name":"Brainstorm","count":1}]}`)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status = %d body=%s", w.Code, w.Body.String())
	}
	d, err := types.LoadDeck(deckPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Pool) != 1 || d.Pool[0].Name != "Brainstorm" {
		t.Fatalf("written pool = %+v", d.Pool)
	}
}
