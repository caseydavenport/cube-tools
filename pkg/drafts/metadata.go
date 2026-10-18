package drafts

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"

	"github.com/caseydavenport/cube-tools/pkg/types"
)

// metadataFile is the name of a draft's metadata file.
const metadataFile = "metadata.json"

// loadMetadata reads a draft directory's metadata.json. A missing file gives
// zero-valued metadata and no error, so callers can tell a directory that
// isn't a draft from one whose metadata is broken.
func loadMetadata(dir string) (*types.DraftMetadata, error) {
	bs, err := os.ReadFile(filepath.Join(dir, metadataFile))
	if os.IsNotExist(err) {
		return &types.DraftMetadata{}, nil
	}
	if err != nil {
		return nil, err
	}
	m := &types.DraftMetadata{}
	if err := json.Unmarshal(bs, m); err != nil {
		return nil, err
	}
	return m, nil
}

// SaveMetadata writes the draft's metadata to its metadata.json. The write is
// atomic, so a crash never leaves a half-written file that would drop the
// draft from List.
func (d Draft) SaveMetadata() error {
	bs, err := json.MarshalIndent(d.DraftMetadata, "", " ")
	if err != nil {
		return err
	}
	return writeFileAtomic(filepath.Join(d.Dir, metadataFile), bs)
}

// writeFileAtomic writes data to a temporary file beside path and renames it
// into place, so readers see either the old contents or the new, never part.
func writeFileAtomic(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		closeAndRemove(tmp)
		return fmt.Errorf("write %s: %w", path, err)
	}
	if err := tmp.Close(); err != nil {
		removeTemp(tmp.Name())
		return fmt.Errorf("write %s: %w", path, err)
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		removeTemp(tmp.Name())
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		removeTemp(tmp.Name())
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

// closeAndRemove discards a temporary file after a failed write.
func closeAndRemove(f *os.File) {
	if err := f.Close(); err != nil {
		logrus.WithError(err).WithField("file", f.Name()).Warn("Failed to close temporary file")
	}
	removeTemp(f.Name())
}

// removeTemp deletes a temporary file, logging rather than returning a
// failure since the caller is already returning the error that matters.
func removeTemp(path string) {
	if err := os.Remove(path); err != nil {
		logrus.WithError(err).WithField("file", path).Warn("Failed to remove temporary file")
	}
}
