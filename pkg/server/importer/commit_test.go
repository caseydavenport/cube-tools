package importer

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/players"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// commitResponse is the body the commit handler returns.
type commitResponse struct {
	DraftID int `json:"draft_id"`
}

func TestCommitCreatesNumberedDraft(t *testing.T) {
	root := t.TempDir()
	if _, err := players.Add(root, "Joan Jett"); err != nil {
		t.Fatal(err)
	}
	src := testCubeSource("polyverse", []string{"Monastery Mentor", "Snapcaster Mage"})

	body := CommitRequest{
		Date:      "2026-06-30",
		EventName: "Test Draft",
		EventCode: "local",
		Decks: []ParsedDeck{
			{
				Player:    "joan",
				PlayerID:  1,
				Mainboard: []CountedCard{{Name: "Monastery Mentor", Count: 1}, {Name: "Plains", Count: 7}},
				Sideboard: []CountedCard{{Name: "Snapcaster Mage", Count: 1}},
			},
			{Player: "p2", Mainboard: []CountedCard{{Name: "Monastery Mentor", Count: 1}}},
		},
	}
	rw := postJSON(t, CommitHandlerWithRoot(src, root), "polyverse", "/api/polyverse/import/commit", body)
	if rw.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rw.Code, rw.Body.String())
	}
	var resp commitResponse
	if err := json.Unmarshal(rw.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.DraftID != 1 {
		t.Fatalf("draft_id = %d, want 1", resp.DraftID)
	}

	dir := filepath.Join(root, "polyverse", "0001_2026-06-30")
	wantPlayerIDByDeck := map[int]int{
		1: 1,
		2: 0,
	}
	for id, player := range wantPlayerIDByDeck {
		d, err := types.LoadDeck(filepath.Join(dir, fmt.Sprintf("%d.json", id)))
		if err != nil {
			t.Fatal(err)
		}
		if d.ID != id || d.PlayerID != player || d.Metadata.DraftID != 1 {
			t.Errorf("deck %d.json = id %d player %d draft %d, want id %d player %d draft 1", id, d.ID, d.PlayerID, d.Metadata.DraftID, id, player)
		}
	}

	// Committing a draft snapshots the cube from Cube Cobra.
	snapBytes, err := os.ReadFile(filepath.Join(dir, "cube-snapshot.json"))
	if err != nil {
		t.Fatalf("cube snapshot not written: %v", err)
	}
	var snap types.Cube
	if err := json.Unmarshal(snapBytes, &snap); err != nil {
		t.Fatal(err)
	}
	if len(snap.Names()) != 2 {
		t.Fatalf("want 2 cards in snapshot, got %d", len(snap.Names()))
	}

	meta, err := types.LoadDraftMetadata(dir)
	if err != nil {
		t.Fatal(err)
	}
	want := types.DraftMetadata{ID: 1, Date: "2026-06-30", EventName: "Test Draft", EventCode: "local"}
	if *meta != want {
		t.Fatalf("metadata = %+v, want %+v", *meta, want)
	}
}

func TestCommitHandlerRejectsBadDate(t *testing.T) {
	root := t.TempDir()
	src := testCubeSource("polyverse", []string{"Monastery Mentor"})
	body := CommitRequest{Date: "../escape", Decks: []ParsedDeck{{Player: "casey"}}}
	rw := postJSON(t, CommitHandlerWithRoot(src, root), "polyverse", "/api/polyverse/import/commit", body)
	if rw.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for bad date, got %d", rw.Code)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("bad date left files behind: %v", entries)
	}
}

func TestCommitRejectsBadPlayerIDs(t *testing.T) {
	root := t.TempDir()
	if _, err := players.Add(root, "Joan Jett"); err != nil {
		t.Fatal(err)
	}
	src := testCubeSource("polyverse", []string{"Monastery Mentor"})
	playerIDsByCase := map[string][]int{
		"unknown":   {1, 9},
		"duplicate": {1, 1},
	}
	for name, ids := range playerIDsByCase {
		body := CommitRequest{Date: "2026-06-30", Decks: []ParsedDeck{{PlayerID: ids[0]}, {PlayerID: ids[1]}}}
		rw := postJSON(t, CommitHandlerWithRoot(src, root), "polyverse", "/api/polyverse/import/commit", body)
		if rw.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, rw.Code)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "polyverse")); !os.IsNotExist(err) {
		t.Fatalf("a rejected commit created the cube dir: %v", err)
	}
}
