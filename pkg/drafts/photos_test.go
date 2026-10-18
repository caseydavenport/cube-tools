package drafts

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// writePhoto writes an empty photo file at rel inside the draft.
func writePhoto(t *testing.T, draft Draft, rel string) {
	t.Helper()
	path := filepath.Join(draft.Dir, rel)
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	writeFile(t, path, "")
}

func TestPhotosOrderedBySeat(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	for seat := 12; seat >= 1; seat-- {
		writePhoto(t, draft, fmt.Sprintf("img/p%d/deck-1.jpg", seat))
	}
	writePhoto(t, draft, "img/extra/deck-1.jpg")

	got, err := draft.Photos()
	require.NoError(t, err)
	var folders []string
	for _, s := range got {
		folders = append(folders, s.Folder)
	}
	assert.Equal(t, []string{"p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12", "extra"}, folders)
	assert.Equal(t, 10, got[9].Seat)
	assert.Equal(t, 0, got[12].Seat)
}

func TestPhotosSortedNaturally(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	for n := 12; n >= 1; n-- {
		writePhoto(t, draft, fmt.Sprintf("img/p1/deck-%d.jpg", n))
	}
	writePhoto(t, draft, "img/p1/checkin-1.jpg")
	writePhoto(t, draft, "img/p1/checkout-1.jpg")
	writePhoto(t, draft, "img/p1/notes.txt")

	got, err := draft.Photos()
	require.NoError(t, err)
	require.Len(t, got, 1)
	var want []string
	for n := 1; n <= 12; n++ {
		want = append(want, fmt.Sprintf("img/p1/deck-%d.jpg", n))
	}
	assert.Equal(t, want, got[0].Deck)
	assert.Equal(t, []string{"img/p1/checkin-1.jpg"}, got[0].Checkin)
	assert.Equal(t, []string{"img/p1/checkout-1.jpg"}, got[0].Checkout)
}

func TestPhotosNoImgDir(t *testing.T) {
	got, err := Draft{Dir: t.TempDir()}.Photos()
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestNewPhotoPathCreatesFolder(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	got, err := draft.NewPhotoPath(7, PhotoDeck, 1, ".png")
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(draft.Dir, "img", "p7", "deck-1.png"), got)
	info, err := os.Stat(filepath.Dir(got))
	require.NoError(t, err)
	assert.True(t, info.IsDir())
}

func TestPhotoPathRejectsEscapes(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	for _, bad := range []string{"", "/etc/passwd", "../x", "img/../../x"} {
		_, ok := draft.PhotoPath(bad)
		assert.False(t, ok, bad)
	}
	got, ok := draft.PhotoPath("img/p1/deck-1.jpg")
	assert.True(t, ok)
	assert.Equal(t, filepath.Join(draft.Dir, "img", "p1", "deck-1.jpg"), got)
}

func TestSessionRoundTrip(t *testing.T) {
	draft := Draft{Dir: t.TempDir()}
	require.NoError(t, draft.SaveSession([]byte(`{"draft_id": 1}`)))

	got, err := draft.Session()
	require.NoError(t, err)
	assert.JSONEq(t, `{"draft_id": 1}`, string(got))
	_, err = os.Stat(filepath.Join(draft.Dir, ".ocr-session.json"))
	assert.NoError(t, err, "the session keeps its file name")
}

func TestSessionMissingIsNil(t *testing.T) {
	got, err := Draft{Dir: t.TempDir()}.Session()
	require.NoError(t, err)
	assert.Nil(t, got)
}
