package importer

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// testCubeSource returns a CubeSource serving an in-memory cube with the given
// card names, standing in for the live Cube Cobra list.
func testCubeSource(cube string, names []string) types.CubeSource {
	c := &types.Cube{}
	for _, n := range names {
		c.Cards = append(c.Cards, types.Card{Name: n})
	}
	return fakeCubeSource{cube: cube, c: c}
}

type fakeCubeSource struct {
	cube string
	c    *types.Cube
}

func (f fakeCubeSource) Current(req string) (*types.Cube, error) { return f.get(req) }
func (f fakeCubeSource) Refresh(req string) (*types.Cube, error) { return f.get(req) }

func (f fakeCubeSource) get(req string) (*types.Cube, error) {
	if req != f.cube {
		return nil, fmt.Errorf("no cube %q", req)
	}
	return f.c, nil
}

func TestImportCardsHandler(t *testing.T) {
	src := testCubeSource("polyverse", []string{"Monastery Mentor", "Snapcaster Mage"})

	req := httptest.NewRequest(http.MethodGet, "/api/polyverse/import/cards", nil)
	req = req.WithContext(server.ContextWithCube(req.Context(), "polyverse"))
	rw := httptest.NewRecorder()
	ImportCardsHandler(src).ServeHTTP(rw, req)

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
