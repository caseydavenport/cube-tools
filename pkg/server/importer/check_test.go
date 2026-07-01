package importer

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestCheckHandlerReportsOverCopies(t *testing.T) {
	root := t.TempDir()
	writeTestCube(t, root, "polyverse", []string{"Monastery Mentor"})

	body := CheckRequest{Decks: []ParsedDeck{{
		Player:    "casey",
		Mainboard: []CountedCard{{Name: "Monastery Mentor", Count: 2}},
	}}}
	rw := postJSON(t, CheckHandlerWithRoot(root), "polyverse", "/api/polyverse/import/check", body)
	if rw.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rw.Code, rw.Body.String())
	}
	var report ConsistencyReport
	if err := json.Unmarshal(rw.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.Clean {
		t.Fatalf("expected not clean: 2 copies of a 1-copy cube card")
	}
	if len(report.Discrepancies) == 0 || report.Discrepancies[0].Kind != "over" {
		t.Fatalf("expected an 'over' discrepancy, got %+v", report.Discrepancies)
	}
}
