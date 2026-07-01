package importer

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/server"
)

func postJSON(t *testing.T, h http.Handler, cube, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req = req.WithContext(server.ContextWithCube(req.Context(), cube))
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, req)
	return rw
}

func TestParseHandlerTXTPool(t *testing.T) {
	root := t.TempDir()
	writeTestCube(t, root, "polyverse", []string{"Monastery Mentor", "Snapcaster Mage"})

	// One 45+ card list is treated as a pool. Keep the test small: a short list
	// lands in mainboard, which is fine for asserting the parse wiring.
	body := ParseRequest{Sources: []ImportSource{{
		Player:   "casey",
		Filename: "casey.txt",
		Content:  "1 Monastery Mentor\n1 Snapcaster Mage\n",
	}}}
	rw := postJSON(t, ParseHandlerWithRoot(root), "polyverse", "/api/polyverse/import/parse", body)
	if rw.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rw.Code, rw.Body.String())
	}
	var resp ParseResponse
	if err := json.Unmarshal(rw.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Decks) != 1 || resp.Decks[0].Player != "casey" {
		t.Fatalf("bad decks: %+v", resp.Decks)
	}
	if !resp.Report.Clean {
		t.Fatalf("expected clean report, got %+v", resp.Report.Discrepancies)
	}
}

func TestParseHandlerUnknownCardWarns(t *testing.T) {
	root := t.TempDir()
	writeTestCube(t, root, "polyverse", []string{"Monastery Mentor"})
	body := ParseRequest{Sources: []ImportSource{{
		Player:   "casey",
		Filename: "casey.txt",
		Content:  "1 Monastery Mentor\n1 Definitely Not A Real Card\n",
	}}}
	rw := postJSON(t, ParseHandlerWithRoot(root), "polyverse", "/api/polyverse/import/parse", body)
	if rw.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rw.Code, rw.Body.String())
	}
	var resp ParseResponse
	_ = json.Unmarshal(rw.Body.Bytes(), &resp)
	if len(resp.Decks[0].Warnings) == 0 {
		t.Fatal("expected a warning for the unresolved card")
	}
}
