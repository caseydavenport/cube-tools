package commands

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// fakeCubeCobra records the paths it was sent and answers a record creation
// with a redirect to record "newrec".
func fakeCubeCobra(t *testing.T) (*[]string, func()) {
	t.Helper()
	var mu sync.Mutex
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		paths = append(paths, r.URL.Path)
		mu.Unlock()
		if r.URL.Path == "/cube/records/hedron/ccid" {
			w.Header().Set("Location", "/cube/record/newrec")
			w.WriteHeader(http.StatusFound)
		}
	}))
	oldURL, oldCube, oldCookie := ccBaseURL, ccCubeID, ccCookie
	ccBaseURL, ccCubeID, ccCookie = srv.URL, "ccid", "c=1"
	return &paths, func() {
		srv.Close()
		ccBaseURL, ccCubeID, ccCookie = oldURL, oldCube, oldCookie
	}
}

// draftWithRecord writes a one-deck draft whose metadata names the given
// CubeCobra record, empty for a draft never exported.
func draftWithRecord(t *testing.T, record string) drafts.Draft {
	t.Helper()
	draft := newDraft(t)
	draft.CubeCobraRecord = record
	require.NoError(t, draft.SaveMetadata())
	d := types.NewDeck()
	d.ID = 1
	require.NoError(t, draft.SaveDeck(d))
	return draft
}

func TestExportUsesRecordIDFromMetadata(t *testing.T) {
	paths, done := fakeCubeCobra(t)
	defer done()
	exportToCC(draftWithRecord(t, "rec9"))
	require.Contains(t, *paths, "/cube/records/edit/overview/rec9")
	require.NotContains(t, *paths, "/cube/records/hedron/ccid")
}

func TestExportCreatesRecordAndSavesID(t *testing.T) {
	paths, done := fakeCubeCobra(t)
	defer done()
	draft := draftWithRecord(t, "")
	exportToCC(draft)
	require.Contains(t, *paths, "/cube/records/hedron/ccid")

	got, err := drafts.Find("data/polyverse", draft.ID)
	require.NoError(t, err)
	require.Equal(t, "newrec", got.CubeCobraRecord)
}

func TestBuildCCRecordListsEachMatchOnceAndPicksTrophy(t *testing.T) {
	draft := newDraft(t)
	decks := []*types.Deck{
		{Player: "Freddie", Date: "2026-01-02", Matches: []types.Match{
			{Opponent: "Ozzy", Round: 1, Wins: 2, Losses: 1},
			{Opponent: "Stevie", Round: 2, Wins: 2, Losses: 0},
			{Opponent: "Joan", Round: 3, Wins: 2, Losses: 0},
		}},
		{Player: "Ozzy", Matches: []types.Match{{Opponent: "Freddie", Round: 1, Wins: 1, Losses: 2}}},
		{Player: "Stevie", Matches: []types.Match{{Opponent: "Freddie", Round: 2, Wins: 0, Losses: 2}}},
	}

	record := buildCCRecord(draft, decks)

	require.Equal(t, []CCPlayer{{Name: "Freddie"}, {Name: "Ozzy"}, {Name: "Stevie"}}, record.Players)
	require.Equal(t, []CCRound{
		{Matches: []CCMatch{{P1: "Freddie", P2: "Ozzy", Results: []int{2, 1, 0}}}},
		{Matches: []CCMatch{{P1: "Freddie", P2: "Stevie", Results: []int{2, 0, 0}}}},
	}, record.Matches, "each match once, and none against Joan, who has no deck")
	require.Equal(t, []string{"Freddie"}, record.Trophy)
}

func TestBuildCCRecordPutsUnknownRoundLast(t *testing.T) {
	decks := []*types.Deck{
		{Player: "Freddie", Matches: []types.Match{
			{Opponent: "Ozzy", Round: 0, Wins: 2},
			{Opponent: "Stevie", Round: 1, Wins: 2},
		}},
		{Player: "Ozzy"},
		{Player: "Stevie"},
	}

	record := buildCCRecord(newDraft(t), decks)

	require.Len(t, record.Matches, 2)
	require.Equal(t, "Stevie", record.Matches[0].Matches[0].P2)
	require.Equal(t, "Ozzy", record.Matches[1].Matches[0].P2)
}

func TestBuildCCRecordNoTrophyWithoutWins(t *testing.T) {
	decks := []*types.Deck{{Player: "Freddie"}, {Player: "Ozzy"}}

	require.Empty(t, buildCCRecord(newDraft(t), decks).Trophy)
}
