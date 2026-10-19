package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/storage/memory"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// cubeInfoCase is one cube setup and the info JSON it should produce.
type cubeInfoCase struct {
	name string
	cube string
	seed func(*memory.Backend)
	want string
}

// infoDeck builds a deck in draft 1 with a one-card mainboard.
func infoDeck(player string) *storage.Deck {
	d := &storage.Deck{}
	d.Player = player
	d.Metadata.DraftID = 1
	d.Date = "2024-01-01"
	d.Mainboard = []types.Card{{Name: "Lightning Bolt"}}
	return d
}

func TestCubeInfoHandlerReportsDataKinds(t *testing.T) {
	cases := []cubeInfoCase{
		{
			name: "empty read-only cube",
			cube: "cc:abc",
			seed: func(b *memory.Backend) {
				b.SetReadOnly("cc:abc")
				b.SeedIndex("cc:abc", &storage.CubeIndex{})
			},
			want: `{"writable":false,"decks":false,"results":false,"pick_logs":false,"archetypes":false,"sideboards":false}`,
		},
		{
			name: "decks without results",
			cube: "polyverse",
			seed: func(b *memory.Backend) {
				b.Seed("polyverse", infoDeck("Ozzy"))
				b.SeedIndex("polyverse", &storage.CubeIndex{Drafts: []storage.IndexedDraft{{DraftInfo: storage.DraftInfo{ID: 1}}}})
			},
			want: `{"writable":true,"decks":true,"results":false,"pick_logs":false,"archetypes":false,"sideboards":false}`,
		},
		{
			name: "full local cube",
			cube: "polyverse",
			seed: func(b *memory.Backend) {
				d := infoDeck("Joan")
				d.Matches = []types.Match{{Opponent: "Ozzy", Round: 1, Wins: 2, Losses: 1}}
				d.MacroArchetype = "aggro"
				d.Sideboard = []types.Card{{Name: "Pyroblast"}}
				b.Seed("polyverse", d)
				b.SeedIndex("polyverse", &storage.CubeIndex{Drafts: []storage.IndexedDraft{{DraftInfo: storage.DraftInfo{ID: 1}, HasLog: true}}})
			},
			want: `{"writable":true,"decks":true,"results":true,"pick_logs":true,"archetypes":true,"sideboards":true}`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			handler := server.CubeInfoHandler(memory.NewStore(tc.seed))
			r := httptest.NewRequest(http.MethodGet, "/api/"+tc.cube+"/info", nil)
			r = r.WithContext(server.ContextWithCube(context.Background(), tc.cube))
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, r)
			assert.Equal(t, http.StatusOK, rec.Code)
			assert.JSONEq(t, tc.want, rec.Body.String())
		})
	}
}
