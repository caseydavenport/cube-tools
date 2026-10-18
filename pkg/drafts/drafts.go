// Package drafts knows the layout of a cube's draft directories: how drafts
// are numbered and named, how to find one by ID, which files in a draft are
// decks, and how new decks are numbered.
package drafts

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// ErrNotFound is returned when no draft or deck has the requested ID.
var ErrNotFound = errors.New("draft not found")

// Draft is a draft's metadata together with the directory it lives in.
type Draft struct {
	types.DraftMetadata
	Dir string
}

// DirName returns the directory name for a draft: its zero-padded ID, then its
// date, so a directory listing sorts in ID order.
func DirName(id int, date string) string {
	return fmt.Sprintf("%04d_%s", id, date)
}

// List returns every draft under cubeDir, sorted by date and then ID. A
// subdirectory counts as a draft only if its metadata.json has an ID; one with
// no ID or unreadable metadata is logged and skipped. A missing cubeDir has no
// drafts.
func List(cubeDir string) ([]Draft, error) {
	entries, err := os.ReadDir(cubeDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("list drafts in %s: %w", cubeDir, err)
	}
	var out []Draft
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(cubeDir, e.Name())
		meta, err := loadMetadata(dir)
		if err != nil {
			logrus.WithError(err).WithField("dir", dir).Warn("Skipping draft with unreadable metadata")
			continue
		}
		if meta.ID == 0 {
			logrus.WithField("dir", dir).Warn("Skipping directory with no draft ID")
			continue
		}
		out = append(out, Draft{Dir: dir, DraftMetadata: *meta})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Date != out[j].Date {
			return out[i].Date < out[j].Date
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

// Find returns the draft under cubeDir with the given ID, or ErrNotFound.
func Find(cubeDir string, id int) (Draft, error) {
	all, err := List(cubeDir)
	if err != nil {
		return Draft{}, err
	}
	for _, d := range all {
		if d.ID == id {
			return d, nil
		}
	}
	return Draft{}, ErrNotFound
}

// createMu serializes Create, so concurrent server requests can't pick the
// same next ID.
var createMu sync.Mutex

// numberedDirRE matches a draft directory name's ID prefix.
var numberedDirRE = regexp.MustCompile(`^(\d{4,})_`)

// highestID is the largest draft ID used under cubeDir, from metadata or a
// directory name, so a directory left without metadata still reserves its ID.
func highestID(cubeDir string) (int, error) {
	all, err := List(cubeDir)
	if err != nil {
		return 0, err
	}
	highest := 0
	for _, d := range all {
		highest = max(highest, d.ID)
	}
	entries, err := os.ReadDir(cubeDir)
	if err != nil && !os.IsNotExist(err) {
		return 0, err
	}
	for _, e := range entries {
		m := numberedDirRE.FindStringSubmatch(e.Name())
		if !e.IsDir() || m == nil {
			continue
		}
		n, err := strconv.Atoi(m[1])
		if err != nil {
			return 0, err
		}
		highest = max(highest, n)
	}
	return highest, nil
}

// Create makes a new draft under cubeDir from meta, which must have a Date. It
// assigns the next unused ID, creates the draft's directory, and writes its
// metadata.json. It refuses to reuse a directory that already exists.
func Create(cubeDir string, meta types.DraftMetadata) (Draft, error) {
	if meta.Date == "" {
		return Draft{}, errors.New("a new draft needs a date")
	}

	// The date becomes part of the directory name, so it must be exactly
	// YYYY-MM-DD and nothing that could reach outside cubeDir.
	if _, err := time.Parse(time.DateOnly, meta.Date); err != nil {
		return Draft{}, fmt.Errorf("draft date %q must be YYYY-MM-DD", meta.Date)
	}

	createMu.Lock()
	defer createMu.Unlock()
	highest, err := highestID(cubeDir)
	if err != nil {
		return Draft{}, err
	}
	meta.ID = highest + 1
	dir := filepath.Join(cubeDir, DirName(meta.ID, meta.Date))
	if err := os.MkdirAll(cubeDir, 0o755); err != nil {
		return Draft{}, err
	}
	if err := os.Mkdir(dir, 0o755); err != nil {
		return Draft{}, fmt.Errorf("create draft directory: %w", err)
	}

	// Another process may have taken the same ID under a different date.
	same, err := filepath.Glob(filepath.Join(cubeDir, fmt.Sprintf("%04d_*", meta.ID)))
	if err != nil {
		return Draft{}, err
	}
	if len(same) > 1 {
		if err := os.Remove(dir); err != nil {
			return Draft{}, fmt.Errorf("draft %d was created concurrently, and removing ours failed: %w", meta.ID, err)
		}
		return Draft{}, fmt.Errorf("draft %d was created concurrently; try again", meta.ID)
	}
	d := Draft{Dir: dir, DraftMetadata: meta}
	if err := d.SaveMetadata(); err != nil {
		return Draft{}, fmt.Errorf("write draft metadata: %w", err)
	}
	return d, nil
}

// Remove deletes the draft's directory and everything in it. Importers call
// it to clean up a draft they created when the import fails partway. It
// refuses a Draft with no ID, which never came from List, Find or Create.
func (d Draft) Remove() error {
	if d.ID == 0 || d.Dir == "" {
		return errors.New("refusing to remove a draft with no ID")
	}
	return os.RemoveAll(d.Dir)
}
