package importer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// writeTestCube writes a minimal data/<cube>/cube.json under dataRoot.
func writeTestCube(t *testing.T, dataRoot, cube string, names []string) {
	t.Helper()
	dir := filepath.Join(dataRoot, cube)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	c := types.Cube{}
	for _, n := range names {
		c.Cards = append(c.Cards, types.Card{Name: n})
	}
	b, _ := json.Marshal(c)
	if err := os.WriteFile(filepath.Join(dir, "cube.json"), b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestImportCardsHandler(t *testing.T) {
	root := t.TempDir()
	writeTestCube(t, root, "polyverse", []string{"Monastery Mentor", "Snapcaster Mage"})

	req := httptest.NewRequest(http.MethodGet, "/api/polyverse/import/cards", nil)
	req = req.WithContext(server.ContextWithCube(req.Context(), "polyverse"))
	rw := httptest.NewRecorder()
	ImportCardsHandlerWithRoot(root).ServeHTTP(rw, req)

	if rw.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (%s)", rw.Code, rw.Body.String())
	}
	var resp struct {
		Cards []CardInfo `json:"cards"`
	}
	if err := json.Unmarshal(rw.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Cards) != 2 {
		t.Fatalf("want 2 cards, got %d", len(resp.Cards))
	}
}
