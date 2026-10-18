package drafts

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	// photoDir holds a draft's photos, one folder per seat named "p<seat>".
	photoDir = "img"

	// sessionFile is the OCR import's working state for a draft.
	sessionFile = ".ocr-session.json"
)

// PhotoKind is what a photo shows, which is also its file name prefix.
type PhotoKind string

const (
	// PhotoCheckin is the pool as a player drafted it.
	PhotoCheckin PhotoKind = "checkin"

	// PhotoCheckout is the pool as a player handed it back.
	PhotoCheckout PhotoKind = "checkout"

	// PhotoDeck is the deck a player built.
	PhotoDeck PhotoKind = "deck"
)

// SeatPhotos are the photos in one of a draft's photo folders. Paths are
// relative to the draft, like "img/p3/deck-1.jpg", which is how the OCR pages
// address them.
type SeatPhotos struct {
	// Folder is the folder's name, normally "p<seat>".
	Folder string

	// Seat is the seat number the folder is named for, or 0 when its name
	// isn't "p<seat>".
	Seat int

	Checkin  []string
	Checkout []string
	Deck     []string
}

// Photos returns the draft's photo folders, ordered by seat number with any
// folder not named for a seat last. Files that aren't check-in, check-out or
// deck photos are left out. A draft without photos gives nil.
func (d Draft) Photos() ([]SeatPhotos, error) {
	entries, err := os.ReadDir(filepath.Join(d.Dir, photoDir))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []SeatPhotos
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		seat, err := d.seatPhotos(e.Name())
		if err != nil {
			return nil, err
		}
		out = append(out, seat)
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if (a.Seat == 0) != (b.Seat == 0) {
			return b.Seat == 0
		}
		if a.Seat != b.Seat {
			return a.Seat < b.Seat
		}
		return a.Folder < b.Folder
	})
	return out, nil
}

// seatPhotos lists the photos in one photo folder.
func (d Draft) seatPhotos(folder string) (SeatPhotos, error) {
	files, err := os.ReadDir(filepath.Join(d.Dir, photoDir, folder))
	if err != nil {
		return SeatPhotos{}, err
	}
	out := SeatPhotos{Folder: folder, Seat: SeatNumber(folder)}
	for _, f := range files {
		rel := path.Join(photoDir, folder, f.Name())
		switch {
		case strings.HasPrefix(f.Name(), string(PhotoCheckin)+"-"):
			out.Checkin = append(out.Checkin, rel)
		case strings.HasPrefix(f.Name(), string(PhotoCheckout)+"-"):
			out.Checkout = append(out.Checkout, rel)
		case strings.HasPrefix(f.Name(), string(PhotoDeck)+"-"):
			out.Deck = append(out.Deck, rel)
		}
	}
	for _, list := range [][]string{out.Checkin, out.Checkout, out.Deck} {
		sort.Slice(list, func(i, j int) bool { return NaturalLess(list[i], list[j]) })
	}
	return out, nil
}

// SeatNumber returns the seat a photo folder named "p<seat>" is for, or 0 for
// any other name. The OCR pages name a seat by its folder.
func SeatNumber(folder string) int {
	n, err := strconv.Atoi(strings.TrimPrefix(folder, "p"))
	if err != nil || n < 1 || folder != fmt.Sprintf("p%d", n) {
		return 0
	}
	return n
}

// NewPhotoPath returns where a seat's nth photo of the given kind goes, as
// "img/p<seat>/<kind>-<n><ext>" in the draft, creating the seat's folder.
func (d Draft) NewPhotoPath(seat int, kind PhotoKind, n int, ext string) (string, error) {
	dir := filepath.Join(d.Dir, photoDir, fmt.Sprintf("p%d", seat))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create photo folder: %w", err)
	}
	return filepath.Join(dir, fmt.Sprintf("%s-%d%s", kind, n, ext)), nil
}

// PhotoPath returns the on-disk path of a photo given relative to the draft,
// or false if rel is absolute or would leave the draft directory. Relative
// paths come from the browser, so this is the guard against reading
// arbitrary files.
func (d Draft) PhotoPath(rel string) (string, bool) {
	if rel == "" || filepath.IsAbs(rel) || strings.Contains(rel, "..") {
		return "", false
	}
	abs := filepath.Join(d.Dir, rel)
	if !strings.HasPrefix(abs, filepath.Clean(d.Dir)+string(filepath.Separator)) {
		return "", false
	}
	return abs, true
}

// Session returns the raw OCR working state saved for the draft, or nil when
// there is none.
func (d Draft) Session() ([]byte, error) {
	bs, err := os.ReadFile(filepath.Join(d.Dir, sessionFile))
	if os.IsNotExist(err) {
		return nil, nil
	}
	return bs, err
}

// SaveSession replaces the draft's saved OCR working state.
func (d Draft) SaveSession(data []byte) error {
	return writeFileAtomic(filepath.Join(d.Dir, sessionFile), data)
}
