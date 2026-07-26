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

// nextDraftSeq returns the next free sequence number for a <date>_<slug>_<seq>
// draft id under dataRoot/cube: the max existing seq plus one, else one.
func nextDraftSeq(dataRoot, cube, date, slug string) int {
	prefix := fmt.Sprintf("%s_%s_", date, slug)
	entries, err := os.ReadDir(filepath.Join(dataRoot, cube))
	if err != nil {
		return 1
	}
	max := 0
	for _, e := range entries {
		if !e.IsDir() || !strings.HasPrefix(e.Name(), prefix) {
			continue
		}
		var n int
		if _, err := fmt.Sscanf(strings.TrimPrefix(e.Name(), prefix), "%d", &n); err == nil && n > max {
			max = n
		}
	}
	return max + 1
}

// buildPhotoDraftDir writes an OCR-ready draft skeleton under dataRoot/cube from
// a folder of deck photos: metadata.json, one img/pN/deck-1.<ext> per image
// (pN by sorted filename), and a per-player deck stub. It returns the derived
// draft id and the deck image paths it wrote, for the caller to normalize. It
// does not reindex.
func buildPhotoDraftDir(dataRoot, cube, sourcePath, date, slug, eventName, flight string) (string, []string, error) {
	if !photoSlugRE.MatchString(slug) {
		return "", nil, fmt.Errorf("slug %q must be lowercase letters, digits, or hyphens", slug)
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return "", nil, fmt.Errorf("date %q must be in YYYY-MM-DD format", date)
	}
	images, err := ScanPhotoFolder(sourcePath)
	if err != nil {
		return "", nil, err
	}
	if len(images) == 0 {
		return "", nil, fmt.Errorf("no images (.jpg/.jpeg/.png) found in %s", sourcePath)
	}

	seq := nextDraftSeq(dataRoot, cube, date, slug)
	draftID := fmt.Sprintf("%s_%s_%d", date, slug, seq)
	outdir := filepath.Join(dataRoot, cube, draftID)
	if _, err := os.Stat(outdir); !os.IsNotExist(err) {
		return "", nil, fmt.Errorf("directory %s already exists; remove it before importing", outdir)
	}
	imgdir := filepath.Join(outdir, "img")
	if err := os.MkdirAll(imgdir, os.ModePerm); err != nil {
		return "", nil, fmt.Errorf("create directories: %w", err)
	}

	meta := &types.DraftMetadata{DraftID: draftID, EventName: eventName, Flight: flight}
	if err := meta.Save(outdir); err != nil {
		return "", nil, fmt.Errorf("write draft metadata: %w", err)
	}

	logc := logrus.WithField("draft", draftID)
	var written []string
	for i, name := range images {
		short := fmt.Sprintf("p%d", i+1)
		playerImgDir := filepath.Join(imgdir, short)
		if err := os.MkdirAll(playerImgDir, os.ModePerm); err != nil {
			return "", nil, fmt.Errorf("create player dir: %w", err)
		}
		dst := filepath.Join(playerImgDir, "deck-1"+strings.ToLower(filepath.Ext(name)))
		if err := copyFile(*logc, filepath.Join(sourcePath, name), dst); err != nil {
			return "", nil, fmt.Errorf("copy image %s: %w", name, err)
		}
		written = append(written, dst)

		deck := types.NewDeck()
		deck.Player = fmt.Sprintf("%s-%s", draftID, short)
		deck.Date = date
		deck.Metadata.DraftID = draftID
		filename := filepath.Join(outdir, deck.Player+".json")
		deck.Metadata.Path = filename
		if err := deck.Save(filename); err != nil {
			return "", nil, fmt.Errorf("write deck stub: %w", err)
		}
	}

	return draftID, written, nil
}

// BuildPhotoDraft builds a draft under data/ from a folder of deck photos,
// normalizes each photo to landscape, reindexes the cube, and returns the draft
// id. Player names and match records are not set here.
func BuildPhotoDraft(cube, sourcePath, date, slug, eventName, flight string) (string, error) {
	draftID, images, err := buildPhotoDraftDir("data", cube, sourcePath, date, slug, eventName, flight)
	if err != nil {
		return "", err
	}
	for _, p := range images {
		if err := forceLandscape(p); err != nil {
			logrus.WithError(err).Warnf("normalize orientation for %s", p)
		}
	}
	if err := Index(cube); err != nil {
		return "", err
	}
	return draftID, nil
}
