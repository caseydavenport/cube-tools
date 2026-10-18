package drafts

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

const (
	// logFile is a draft's pick log, exported from Draftmancer.
	logFile = "draft-log.json"

	// reportFile is a draft's write-up, used as its CubeCobra description when
	// the metadata has none.
	reportFile = "REPORT"

	// snapshotFile is the cube list as it was when the draft was created.
	snapshotFile = "cube-snapshot.json"
)

// Log returns the draft's raw pick log, or ErrNotFound when it has none.
func (d Draft) Log() ([]byte, error) {
	bs, err := os.ReadFile(filepath.Join(d.Dir, logFile))
	if os.IsNotExist(err) {
		return nil, ErrNotFound
	}
	return bs, err
}

// HasLog reports whether the draft has a pick log.
func (d Draft) HasLog() bool {
	return exists(filepath.Join(d.Dir, logFile))
}

// Report returns the draft's write-up, or "" when it has none or it can't be
// read.
func (d Draft) Report() string {
	bs, err := os.ReadFile(filepath.Join(d.Dir, reportFile))
	if err != nil {
		return ""
	}
	return string(bs)
}

// HasSnapshot reports whether the draft has a cube snapshot.
func (d Draft) HasSnapshot() bool {
	return exists(filepath.Join(d.Dir, snapshotFile))
}

// Snapshot returns the cube list saved when the draft was created, or
// ErrNotFound when the draft has none.
func (d Draft) Snapshot() (*types.Cube, error) {
	path := filepath.Join(d.Dir, snapshotFile)
	if !exists(path) {
		return nil, ErrNotFound
	}
	return types.LoadCube(path)
}

// SaveSnapshot records the cube list the draft was played with.
func (d Draft) SaveSnapshot(c *types.Cube) error {
	bs, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(filepath.Join(d.Dir, snapshotFile), bs)
}

// LatestSnapshot returns the cube snapshot of the highest-numbered draft under
// cubeDir that has one. IDs are assigned in order, so that's the most recently
// added draft. ok is false when no draft has a snapshot.
func LatestSnapshot(cubeDir string) (*types.Cube, bool, error) {
	all, err := List(cubeDir)
	if err != nil {
		return nil, false, err
	}
	var latest *Draft
	for i := range all {
		if all[i].HasSnapshot() && (latest == nil || all[i].ID > latest.ID) {
			latest = &all[i]
		}
	}
	if latest == nil {
		return nil, false, nil
	}
	c, err := latest.Snapshot()
	if err != nil {
		return nil, false, err
	}
	return c, true, nil
}

// CopySource keeps a deck's source decklist with the draft. A file already in
// the draft (a reparse) is returned as is; any other is copied to
// "<deckID><suffix><ext>" in the draft and the copy's path returned. The copy's
// path comes back even when copying fails, matching what the deck records.
func (d Draft) CopySource(src string, deckID int, suffix string) (string, error) {
	if filepath.Clean(filepath.Dir(src)) == filepath.Clean(d.Dir) {
		return src, nil
	}
	dst := filepath.Join(d.Dir, fmt.Sprintf("%d%s%s", deckID, suffix, sourceExt(src)))
	bs, err := os.ReadFile(src)
	if err != nil {
		return dst, fmt.Errorf("read source %s: %w", src, err)
	}
	if err := os.WriteFile(dst, bs, 0o644); err != nil {
		return dst, fmt.Errorf("copy source to %s: %w", dst, err)
	}
	return dst, nil
}

// sourceExt returns the decklist extension the copy keeps: .txt or .csv, or
// none for anything else.
func sourceExt(path string) string {
	for _, ext := range []string{".txt", ".csv"} {
		if strings.HasSuffix(path, ext) {
			return ext
		}
	}
	return ""
}

// exists reports whether path exists.
func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
