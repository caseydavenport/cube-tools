package commands

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// photoSlugRE matches an event slug: lowercase letters, digits and hyphens.
var photoSlugRE = regexp.MustCompile(`^[a-z0-9-]+$`)

// photoImageExts holds the lowercase file extensions scanPhotoFolder treats as
// photos.
var photoImageExts = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
}

// scanPhotoFolder lists image files (jpg/jpeg/png) directly under dir, in
// natural filename order. Subdirectories and non-image files are ignored. It
// errors if dir does not exist or is not a directory.
func scanPhotoFolder(dir string) ([]string, error) {
	info, err := os.Stat(dir)
	if err != nil {
		return nil, fmt.Errorf("source folder: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("source path %q is not a directory", dir)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read source folder: %w", err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if photoImageExts[strings.ToLower(filepath.Ext(e.Name()))] {
			names = append(names, e.Name())
		}
	}
	sort.Slice(names, func(i, j int) bool { return drafts.NaturalLess(names[i], names[j]) })
	return names, nil
}

// buildPhotoDraftDir writes an OCR-ready draft skeleton under dataRoot/cube from
// a folder of deck photos: metadata.json, the cube list cl as the draft's
// snapshot, one img/pN/deck-1.<ext> per image (pN in natural filename order),
// and an anonymous deck stub per photo. It returns the new draft and the deck
// image paths it wrote, for the caller to normalize. A failure partway removes
// the draft.
func buildPhotoDraftDir(dataRoot, cube string, cl *types.Cube, sourcePath, date, slug, eventName, flight string) (drafts.Draft, []string, error) {
	if !photoSlugRE.MatchString(slug) {
		return drafts.Draft{}, nil, fmt.Errorf("slug %q must be lowercase letters, digits, or hyphens", slug)
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return drafts.Draft{}, nil, fmt.Errorf("date %q must be in YYYY-MM-DD format", date)
	}
	images, err := scanPhotoFolder(sourcePath)
	if err != nil {
		return drafts.Draft{}, nil, err
	}
	if len(images) == 0 {
		return drafts.Draft{}, nil, fmt.Errorf("no images (.jpg/.jpeg/.png) found in %s", sourcePath)
	}

	draft, err := drafts.Create(filepath.Join(dataRoot, cube), types.DraftMetadata{
		Date:      date,
		EventName: eventName,
		EventCode: slug,
		Flight:    flight,
	}, cl)
	if err != nil {
		return drafts.Draft{}, nil, err
	}
	written, err := writePhotoDraft(draft, sourcePath, date, images)
	if err != nil {
		discardDraft(draft)
		return drafts.Draft{}, nil, err
	}
	return draft, written, nil
}

// writePhotoDraft copies each photo into its seat's folder in the new draft and
// writes an anonymous deck stub for the seat, returning the photo paths.
func writePhotoDraft(draft drafts.Draft, sourcePath, date string, images []string) ([]string, error) {
	var written []string
	for i, name := range images {
		deckID := i + 1
		dst, err := draft.NewPhotoPath(deckID, drafts.PhotoDeck, 1, strings.ToLower(filepath.Ext(name)))
		if err != nil {
			return nil, err
		}
		if err := copyFile(filepath.Join(sourcePath, name), dst); err != nil {
			return nil, fmt.Errorf("copy image %s: %w", name, err)
		}
		written = append(written, dst)

		deck := types.NewDeck()
		deck.ID = deckID
		deck.Seat = deckID
		deck.Date = date
		deck.Metadata.DraftID = draft.ID
		if err := draft.SaveDeck(deck); err != nil {
			return nil, fmt.Errorf("write deck stub: %w", err)
		}
	}
	return written, nil
}

// copyFile copies a source photo to dst, replacing any file already there.
func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
}

// BuildPhotoDraft builds a draft under data/ from a folder of deck photos,
// normalizes each photo to landscape, and returns the draft ID. cl is the cube
// list the draft was played with, saved as its snapshot. Decks start as
// anonymous seats with no match records.
func BuildPhotoDraft(cube string, cl *types.Cube, sourcePath, date, slug, eventName, flight string) (int, error) {
	draft, images, err := buildPhotoDraftDir("data", cube, cl, sourcePath, date, slug, eventName, flight)
	if err != nil {
		return 0, err
	}
	for _, p := range images {
		if err := forceLandscape(p); err != nil {
			logrus.WithError(err).Warnf("normalize orientation for %s", p)
		}
	}
	return draft.ID, nil
}
