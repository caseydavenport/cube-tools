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

var photoSlugRE = regexp.MustCompile(`^[a-z0-9-]+$`)

var photoImageExts = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
}

// ScanPhotoFolder lists image files (jpg/jpeg/png) directly under dir, sorted by
// name. Subdirectories and non-image files are ignored. It errors if dir does
// not exist or is not a directory.
func ScanPhotoFolder(dir string) ([]string, error) {
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
	sort.Strings(names)
	return names, nil
}

// buildPhotoDraftDir writes an OCR-ready draft skeleton under dataRoot/cube from
// a folder of deck photos: metadata.json, one img/pN/deck-1.<ext> per image
// (pN by sorted filename), and an anonymous deck stub per photo. It returns the new
// draft and the deck image paths it wrote, for the caller to normalize. It
// does not reindex.
func buildPhotoDraftDir(dataRoot, cube, sourcePath, date, slug, eventName, flight string) (drafts.Draft, []string, error) {
	if !photoSlugRE.MatchString(slug) {
		return drafts.Draft{}, nil, fmt.Errorf("slug %q must be lowercase letters, digits, or hyphens", slug)
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return drafts.Draft{}, nil, fmt.Errorf("date %q must be in YYYY-MM-DD format", date)
	}
	images, err := ScanPhotoFolder(sourcePath)
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
	})
	if err != nil {
		return drafts.Draft{}, nil, err
	}
	imgdir := filepath.Join(draft.Dir, "img")

	logc := logrus.WithField("draft", draft.ID)
	var written []string
	for i, name := range images {
		deckID := i + 1
		short := fmt.Sprintf("p%d", deckID)
		playerImgDir := filepath.Join(imgdir, short)
		if err := os.MkdirAll(playerImgDir, os.ModePerm); err != nil {
			return drafts.Draft{}, nil, fmt.Errorf("create player dir: %w", err)
		}
		dst := filepath.Join(playerImgDir, "deck-1"+strings.ToLower(filepath.Ext(name)))
		if err := copyFile(*logc, filepath.Join(sourcePath, name), dst); err != nil {
			return drafts.Draft{}, nil, fmt.Errorf("copy image %s: %w", name, err)
		}
		written = append(written, dst)

		deck := types.NewDeck()
		deck.ID = deckID
		deck.Seat = deckID
		deck.Date = date
		deck.Metadata.DraftID = draft.ID
		if err := draft.SaveDeck(deck); err != nil {
			return drafts.Draft{}, nil, fmt.Errorf("write deck stub: %w", err)
		}
	}

	return draft, written, nil
}

// BuildPhotoDraft builds a draft under data/ from a folder of deck photos,
// normalizes each photo to landscape, reindexes the cube, and returns the draft
// ID. Decks start as anonymous seats with no match records.
func BuildPhotoDraft(cube, sourcePath, date, slug, eventName, flight string) (int, error) {
	draft, images, err := buildPhotoDraftDir("data", cube, sourcePath, date, slug, eventName, flight)
	if err != nil {
		return 0, err
	}
	for _, p := range images {
		if err := forceLandscape(p); err != nil {
			logrus.WithError(err).Warnf("normalize orientation for %s", p)
		}
	}
	if err := Index(cube); err != nil {
		return 0, err
	}
	return draft.ID, nil
}
