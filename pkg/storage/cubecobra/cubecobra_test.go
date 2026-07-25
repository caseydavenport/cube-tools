package cubecobra

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// fakeCube serves a fixed card list so RawDecks resolves names without the
// oracle bulk dataset.
type fakeCube struct{ cards []types.Card }

func (f fakeCube) Current(string) (*types.Cube, error) { return &types.Cube{Cards: f.cards}, nil }
func (f fakeCube) Refresh(string) (*types.Cube, error) { return &types.Cube{Cards: f.cards}, nil }

const analysisFixture = `{"success":"true",
  "records":[
    {"id":"rec1","name":"Draft 1","date":1681862400000,
     "players":[{"name":"casey"},{"name":"matt"}],
     "matches":[{"matches":[{"p1":"casey","p2":"matt","results":[2,1,0]}]}],
     "trophy":["casey"],
     "decks":{"casey":["oa","ob"],"matt":["oc"]}}],
  "cards":{
    "oa":{"name":"Llanowar Elves"},
    "ob":{"name":"Forest"},
    "oc":{"name":"Mountain"}}}`

func newFixtureServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/cube/records/analysisdata/polyversal" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(analysisFixture))
	}))
}

func TestRawDecks(t *testing.T) {
	srv := newFixtureServer(t)
	defer srv.Close()
	src := fakeCube{cards: []types.Card{
		{Name: "Llanowar Elves", Tags: []string{"ramp"}},
		{Name: "Forest"}, {Name: "Mountain"},
	}}
	b := New(srv.URL, src)

	decks, err := b.RawDecks("cc:polyversal")
	if err != nil {
		t.Fatal(err)
	}
	if len(decks) != 2 {
		t.Fatalf("got %d decks, want 2", len(decks))
	}
	byPlayer := map[string]int{}
	for _, d := range decks {
		byPlayer[d.Player] = len(d.Mainboard)
		if d.ID != d.Player {
			t.Errorf("deck %s: ID=%q, want ID==Player", d.Player, d.ID)
		}
		if d.Metadata.DraftID != "rec1" {
			t.Errorf("deck %s: DraftID=%q, want rec1", d.Player, d.Metadata.DraftID)
		}
		if d.Date != "2023-04-19" {
			t.Errorf("deck %s: Date=%q, want 2023-04-19", d.Player, d.Date)
		}
		if d.DraftSize != 2 {
			t.Errorf("deck %s: DraftSize=%d, want 2", d.Player, d.DraftSize)
		}
		if d.Sideboard == nil {
			t.Errorf("deck %s: Sideboard is nil, want non-nil empty slice", d.Player)
		}
	}
	if byPlayer["casey"] != 2 || byPlayer["matt"] != 1 {
		t.Fatalf("mainboard sizes: %v, want casey=2 matt=1", byPlayer)
	}

	var casey *struct{}
	for _, d := range decks {
		if d.Player != "casey" {
			continue
		}
		casey = &struct{}{}
		if len(d.Matches) != 1 {
			t.Fatalf("casey matches=%d, want 1", len(d.Matches))
		}
		m := d.Matches[0]
		if m.Opponent != "matt" || m.Wins != 2 || m.Losses != 1 || m.Draws != 0 || m.Round != 1 {
			t.Errorf("casey match = %+v, want opp=matt 2-1-0 round=1", m)
		}
		// Tag overlay from the cube source.
		if len(d.Mainboard) > 0 && d.Mainboard[0].Name == "Llanowar Elves" && len(d.Mainboard[0].Tags) == 0 {
			t.Error("expected cube tags overlaid on Llanowar Elves")
		}
	}
	if casey == nil {
		t.Fatal("no casey deck")
	}

	// matt sees the match from the opposite side.
	for _, d := range decks {
		if d.Player != "matt" {
			continue
		}
		m := d.Matches[0]
		if m.Opponent != "casey" || m.Wins != 1 || m.Losses != 2 {
			t.Errorf("matt match = %+v, want opp=casey 1-2", m)
		}
	}
}

func TestIndex(t *testing.T) {
	srv := newFixtureServer(t)
	defer srv.Close()
	b := New(srv.URL, fakeCube{})

	idx, err := b.Index("cc:polyversal")
	if err != nil {
		t.Fatal(err)
	}
	if len(idx.Drafts) != 1 {
		t.Fatalf("got %d drafts, want 1", len(idx.Drafts))
	}
	d := idx.Drafts[0]
	if d.DraftID != "rec1" || d.Date != "2023-04-19" || d.HasLog {
		t.Errorf("draft = %+v, want rec1 2023-04-19 HasLog=false", d)
	}
	if len(d.Decks) != 2 {
		t.Fatalf("got %d decks, want 2", len(d.Decks))
	}
	ids := map[string]bool{}
	for _, dk := range d.Decks {
		ids[dk.ID] = true
	}
	if !ids["casey"] || !ids["matt"] {
		t.Errorf("deck ids = %v, want casey and matt", ids)
	}
}
