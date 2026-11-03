package file

import (
	"errors"
	"os"
	"slices"
	"sync"
	"time"

	"github.com/caseydavenport/cube-tools/pkg/drafts"
	"github.com/caseydavenport/cube-tools/pkg/types"
)

// snapshotCache keeps each parsed cube snapshot in memory, keyed by its path.
// Package requests read every draft's snapshot, and parsing them is most of
// the cost; an entry is reread when the file's modification time or size
// changes, so a rebuilt snapshot is picked up without a restart.
type snapshotCache struct {
	mu      sync.Mutex
	entries map[string]cachedSnapshot
}

// cachedSnapshot is one parsed snapshot and the file stamp it was read at.
type cachedSnapshot struct {
	modTime time.Time
	size    int64
	cube    *types.Cube
}

// newSnapshotCache returns an empty cache.
func newSnapshotCache() *snapshotCache {
	return &snapshotCache{entries: map[string]cachedSnapshot{}}
}

// load returns the snapshot at path, from memory when the file is unchanged.
// It returns drafts.ErrNotFound for a missing file. The caller gets its own
// copy of the card list, so changing it can't change later reads.
func (c *snapshotCache) load(path string) (*types.Cube, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, drafts.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	entry, ok := c.entries[path]
	c.mu.Unlock()
	if !ok || !entry.modTime.Equal(info.ModTime()) || entry.size != info.Size() {
		cube, err := types.LoadCube(path)
		if err != nil {
			return nil, err
		}
		entry = cachedSnapshot{modTime: info.ModTime(), size: info.Size(), cube: cube}
		c.mu.Lock()
		c.entries[path] = entry
		c.mu.Unlock()
	}

	out := *entry.cube
	out.Cards = slices.Clone(entry.cube.Cards)
	return &out, nil
}
