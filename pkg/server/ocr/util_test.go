package ocr

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/server"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// newDraft creates the next numbered draft of cube "polyverse" under root,
// dated 2026-01-17 unless meta says otherwise.
func newDraft(t *testing.T, root string, meta types.DraftMetadata) drafts.Draft {
	t.Helper()
	if meta.Date == "" {
		meta.Date = "2026-01-17"
	}
	d, err := drafts.Create(filepath.Join(root, "polyverse"), meta)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// draftReq builds a request for one of draft d's routes.
func draftReq(t *testing.T, method, suffix string, d drafts.Draft) *http.Request {
	t.Helper()
	id := strconv.Itoa(d.ID)
	r := reqWithCube(t, method, "/api/polyverse/ocr/drafts/"+id+suffix, "polyverse")
	r.SetPathValue("draft_id", id)
	return r
}

// writeDeck writes a deck file with the given id into draft d.
func writeDeck(t *testing.T, d drafts.Draft, deck *types.Deck) string {
	t.Helper()
	if err := d.SaveDeck(deck); err != nil {
		t.Fatal(err)
	}
	return deck.Metadata.Path
}

// reqWithCube builds a test request with the cube id attached the way the
// WithCube middleware would, so handlers calling CubeFromRequest see it.
func reqWithCube(t *testing.T, method, target, cube string) *http.Request {
	t.Helper()
	r := httptest.NewRequest(method, target, nil)
	// WithCube stores the id under an unexported key; in tests we go through
	// the exported setter instead.
	return r.WithContext(server.ContextWithCube(context.Background(), cube))
}

func bodyOf(s string) io.ReadCloser { return io.NopCloser(strings.NewReader(s)) }

// writeFile creates path's parent dirs and writes body, failing the test on error.
func writeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// pool builds a PlayerWork with just the given pool entries, the common shape
// for the pool/deck consistency checks.
func pool(entries ...PoolEntry) *PlayerWork { return &PlayerWork{PoolEntries: entries} }

func entry(name string, count int) PoolEntry { return PoolEntry{CardName: name, Count: count} }

// hasWarning reports whether want is among the warnings.
func hasWarning(warnings []string, want string) bool {
	for _, w := range warnings {
		if w == want {
			return true
		}
	}
	return false
}
