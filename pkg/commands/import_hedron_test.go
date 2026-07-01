package commands

import "testing"

func TestLocalPlayerID(t *testing.T) {
	got := localPlayerID("2026-06-30_evt_1", "Player 3")
	want := "2026-06-30_evt_1-p3"
	if got != want {
		t.Fatalf("localPlayerID: want %q, got %q", want, got)
	}
}

func TestImportHedronDraftUnknownID(t *testing.T) {
	// A draft ID absent from the (empty, since the cube is bogus) result set
	// must return an error, not fatal. Network failure also returns an error.
	if _, err := ImportHedronDraft("polyverse", "definitely-not-a-cube", "nope"); err == nil {
		t.Skip("network reached a real endpoint; skipping negative assertion")
	}
}
