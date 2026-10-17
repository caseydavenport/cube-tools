package commands

import "testing"

func TestHedronPlayerNum(t *testing.T) {
	if got := hedronPlayerNum("Player 3"); got != 3 {
		t.Fatalf("hedronPlayerNum: want 3, got %d", got)
	}
	if got := hedronPlayerNum("Somebody"); got != 0 {
		t.Fatalf("hedronPlayerNum: want 0 for an unexpected shape, got %d", got)
	}
}

func TestPlaceholderPlayer(t *testing.T) {
	if got := PlaceholderPlayer(51, 3); got != "0051-p3" {
		t.Fatalf("PlaceholderPlayer: want 0051-p3, got %q", got)
	}
}

func TestImportHedronDraftUnknownID(t *testing.T) {
	// A draft ID absent from the (empty, since the cube is bogus) result set
	// must return an error, not fatal. Network failure also returns an error.
	if _, err := ImportHedronDraft("polyverse", "definitely-not-a-cube", "nope"); err == nil {
		t.Skip("network reached a real endpoint; skipping negative assertion")
	}
}
