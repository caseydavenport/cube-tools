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
	require.NoError(t, d.Save(drafts.DeckPath(draft.Dir, 1)))
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
