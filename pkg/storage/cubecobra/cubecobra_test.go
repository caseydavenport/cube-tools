package cubecobra

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/storage"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// fakeCube serves a fixed card list so RawDecks resolves names without the
// oracle bulk dataset.
type fakeCube struct{ cards []types.Card }

func (f fakeCube) Current(string) (*types.Cube, error) {
	return &types.Cube{Cards: f.cards}, nil
}

func (f fakeCube) Refresh(string) (*types.Cube, error) {
	return &types.Cube{Cards: f.cards}, nil
}

const analysisFixture = `{"success":"true",
  "records":[
    {"id":"rec1","name":"Draft 1","date":1681862400000,
     "players":[{"name":"freddie"},{"name":"ozzy"}],
     "matches":[{"matches":[{"p1":"freddie","p2":"ozzy","results":[2,1,0]}]}],
     "trophy":["freddie"],
     "decks":{"freddie":["oa","ob"],"ozzy":["oc"]}}],
  "cards":{
    "oa":{"name":"Llanowar Elves"},
    "ob":{"name":"Forest"},
    "oc":{"name":"Mountain"}}}`

// newFixtureServer serves analysisFixture for the polyversal cube and counts
// the requests it answers.
func newFixtureServer(t *testing.T, requests *atomic.Int32) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/cube/records/analysisdata/polyversal" {
			http.NotFound(w, r)
			return
		}
		requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write([]byte(analysisFixture)); err != nil {
			t.Error(err)
		}
	}))
}

// deckOf returns the named player's deck, failing the test if there is none.
func deckOf(t *testing.T, decks []*storage.Deck, player string) *storage.Deck {
	t.Helper()
	for _, d := range decks {
		if d.Player == player {
			return d
		}
	}
	t.Fatalf("no deck for player %q", player)
	return nil
}

func TestRawDecks(t *testing.T) {
	var requests atomic.Int32
	srv := newFixtureServer(t, &requests)
	defer srv.Close()
	src := fakeCube{cards: []types.Card{
		{Name: "Llanowar Elves", Tags: []string{"ramp"}},
		{Name: "Forest"},
		{Name: "Mountain"},
	}}
	b := New(srv.URL, src)

	decks, err := b.RawDecks("cc:polyversal")
	if err != nil {
		t.Fatal(err)
	}
	if len(decks) != 2 {
		t.Fatalf("got %d decks, want 2", len(decks))
	}
	numCardsByPlayer := map[string]int{}
	ids := map[int]bool{}
	for _, d := range decks {
		numCardsByPlayer[d.Player] = len(d.Mainboard)
		ids[d.ID] = true
		if d.Metadata.DraftID != 1 {
			t.Errorf("deck %s: DraftID=%d, want 1", d.Player, d.Metadata.DraftID)
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
	if !ids[1] || !ids[2] {
		t.Errorf("deck ids = %v, want 1 and 2", ids)
	}
	if numCardsByPlayer["freddie"] != 2 || numCardsByPlayer["ozzy"] != 1 {
		t.Fatalf("mainboard sizes: %v, want freddie=2 ozzy=1", numCardsByPlayer)
	}

	freddie := deckOf(t, decks, "freddie")
	if len(freddie.Matches) != 1 {
		t.Fatalf("freddie matches=%d, want 1", len(freddie.Matches))
	}
	match := freddie.Matches[0]
	if match.Opponent != "ozzy" || match.Wins != 2 || match.Losses != 1 || match.Draws != 0 || match.Round != 1 {
		t.Errorf("freddie match = %+v, want opp=ozzy 2-1-0 round=1", match)
	}

	// The cube source's tags land on the deck's card, and a card the cube
	// lacks a tag for stays tagless.
	elves := freddie.Mainboard[0]
	if elves.Name != "Llanowar Elves" || len(elves.Tags) != 1 || elves.Tags[0] != "ramp" {
		t.Errorf("first card = %+v, want Llanowar Elves tagged ramp", elves)
	}
	if forest := freddie.Mainboard[1]; len(forest.Tags) != 0 {
		t.Errorf("Forest tags = %v, want none", forest.Tags)
	}

	// Ozzy sees the match from the opposite side.
	ozzy := deckOf(t, decks, "ozzy")
	match = ozzy.Matches[0]
	if match.Opponent != "freddie" || match.Wins != 1 || match.Losses != 2 {
		t.Errorf("ozzy match = %+v, want opp=freddie 1-2", match)
	}
}

func TestIndex(t *testing.T) {
	var requests atomic.Int32
	srv := newFixtureServer(t, &requests)
	defer srv.Close()
	b := New(srv.URL, fakeCube{})

	idx, err := b.Index("cc:polyversal")
	if err != nil {
		t.Fatal(err)
	}
	if len(idx.Drafts) != 1 {
		t.Fatalf("got %d drafts, want 1", len(idx.Drafts))
	}
	draft := idx.Drafts[0]
	if draft.ID != 1 || draft.Date != "2023-04-19" || draft.EventName != "Draft 1" || draft.HasLog {
		t.Errorf("draft = %+v, want 1 2023-04-19 \"Draft 1\" HasLog=false", draft)
	}
	if len(draft.Decks) != 2 {
		t.Fatalf("got %d decks, want 2", len(draft.Decks))
	}
	ids := map[int]bool{}
	for _, deck := range draft.Decks {
		ids[deck.ID] = true
	}
	if !ids[1] || !ids[2] {
		t.Errorf("deck ids = %v, want 1 and 2", ids)
	}
}

func TestFetchIsCached(t *testing.T) {
	var requests atomic.Int32
	srv := newFixtureServer(t, &requests)
	defer srv.Close()
	b := New(srv.URL, fakeCube{})

	for range 3 {
		if _, err := b.RawDecks("cc:polyversal"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := b.Index("cc:polyversal"); err != nil {
		t.Fatal(err)
	}
	if got := requests.Load(); got != 1 {
		t.Errorf("server saw %d requests, want 1", got)
	}
}

func TestRawDecksReportsFetchFailure(t *testing.T) {
	var requests atomic.Int32
	srv := newFixtureServer(t, &requests)
	defer srv.Close()
	b := New(srv.URL, fakeCube{})

	// The fixture server answers 404 for any cube but polyversal.
	if _, err := b.RawDecks("cc:missing"); err == nil {
		t.Error("RawDecks of a cube CubeCobra 404s on returned no error")
	}
	if _, err := b.Index("cc:missing"); err == nil {
		t.Error("Index of a cube CubeCobra 404s on returned no error")
	}
}

// twoRecordFixture lists a later record before an earlier one, so draft IDs
// must come from dates rather than response order.
const twoRecordFixture = `{"success":"true",
  "records":[
    {"id":"late","name":"Later","date":1700000000000,"players":[{"name":"freddie"}],"matches":[],"decks":{"freddie":[]}},
    {"id":"early","name":"Earlier","date":1600000000000,"players":[{"name":"freddie"}],"matches":[],"decks":{"freddie":[]}}],
  "cards":{}}`

func TestCubeCobraDraftIDsByDate(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write([]byte(twoRecordFixture)); err != nil {
			t.Error(err)
		}
	}))
	defer srv.Close()
	backend := New(srv.URL, fakeCube{})

	decks, err := backend.RawDecks("cc:polyversal")
	if err != nil {
		t.Fatal(err)
	}
	draftIDByEventName := map[string]int{}
	for _, d := range decks {
		draftIDByEventName[d.Draft.EventName] = d.Metadata.DraftID
		if d.Draft.ID != d.Metadata.DraftID {
			t.Errorf("deck draft info id %d != metadata draft id %d", d.Draft.ID, d.Metadata.DraftID)
		}
	}
	if draftIDByEventName["Earlier"] != 1 || draftIDByEventName["Later"] != 2 {
		t.Errorf("draft ids by record name = %v, want Earlier 1 and Later 2", draftIDByEventName)
	}

	idx, err := backend.Index("cc:polyversal")
	if err != nil {
		t.Fatal(err)
	}
	if idx.Drafts[0].EventName != "Earlier" || idx.Drafts[0].ID != 1 {
		t.Errorf("first indexed draft = %+v, want Earlier with id 1", idx.Drafts[0].DraftInfo)
	}
}
