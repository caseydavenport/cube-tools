package types

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Cube struct {
	Cards []Card `json:"cards"`

	// counts maps a lowercased card name to the number of copies in the cube.
	// Built lazily on first MaxCopies call.
	counts map[string]int
}

// LoadOptions selects which cube list to load from disk.
type LoadOptions struct {
	// DataRoot is the path to the repo's data directory.
	DataRoot string

	// Cube is the cube name, e.g. "polyverse".
	Cube string

	// Date is a YYYY-MM-DD snapshot date; empty means the latest snapshot.
	Date string
}

// LoadCube reads a single cube file at path.
func LoadCube(path string) (*Cube, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	c := &Cube{}
	if err := json.Unmarshal(contents, c); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return c, nil
}

// LoadCubeList loads a cube's card list from disk, resolving the snapshot to
// use from the options.
func LoadCubeList(opts LoadOptions) (*Cube, error) {
	if opts.Cube == "" {
		return nil, fmt.Errorf("cube name is required")
	}
	cubeDir := filepath.Join(opts.DataRoot, opts.Cube)

	// A specific date pins us to that snapshot, with no fallback.
	if opts.Date != "" {
		path := filepath.Join(cubeDir, opts.Date, "cube-snapshot.json")
		c, err := LoadCube(path)
		if err == nil {
			return c, nil
		}
		if !os.IsNotExist(err) {
			return nil, err
		}
		return nil, fmt.Errorf("no snapshot for cube %q on %s", opts.Cube, opts.Date)
	}

	// Otherwise prefer the most recent snapshot.
	path, ok, err := latestSnapshot(cubeDir)
	if err != nil {
		return nil, err
	}
	if ok {
		return LoadCube(path)
	}

	// Fall back to the un-snapshotted cube.json.
	path = filepath.Join(cubeDir, "cube.json")
	c, err := LoadCube(path)
	if err != nil {
		return nil, fmt.Errorf("no cube list found for %q: %w", opts.Cube, err)
	}
	return c, nil
}

// Names returns the unique card names in iteration order of first appearance.
func (c *Cube) Names() []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(c.Cards))
	for _, card := range c.Cards {
		if seen[card.Name] {
			continue
		}
		seen[card.Name] = true
		out = append(out, card.Name)
	}
	return out
}

// MaxCopies returns the number of times name appears in the cube.
// Comparison is case-insensitive.
func (c *Cube) MaxCopies(name string) int {
	if c.counts == nil {
		c.counts = map[string]int{}
		for _, card := range c.Cards {
			c.counts[strings.ToLower(card.Name)]++
		}
	}
	return c.counts[strings.ToLower(name)]
}

// latestSnapshot returns the path to the cube-snapshot.json under the
// most-recent YYYY-MM-DD subdirectory of cubeDir, or ok=false if none exists.
func latestSnapshot(cubeDir string) (string, bool, error) {
	entries, err := os.ReadDir(cubeDir)
	if err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, err
	}
	var dates []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if len(name) == 10 && name[4] == '-' && name[7] == '-' {
			if _, err := os.Stat(filepath.Join(cubeDir, name, "cube-snapshot.json")); err == nil {
				dates = append(dates, name)
			}
		}
	}
	if len(dates) == 0 {
		return "", false, nil
	}
	sort.Strings(dates)
	return filepath.Join(cubeDir, dates[len(dates)-1], "cube-snapshot.json"), true, nil
}
