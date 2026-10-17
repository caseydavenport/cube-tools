package types

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type Cube struct {
	Cards []Card `json:"cards"`

	// counts maps a lowercased card name to the number of copies in the cube.
	// Built lazily on first MaxCopies call.
	counts map[string]int
}

// CubeSource provides cube card lists to the server. The server backs it with
// the CubeCobra-fed provider and injects it into handlers, rather than reaching
// for a package global.
type CubeSource interface {
	// Current returns the cube's card list, cached copy included.
	Current(cube string) (*Cube, error)

	// Refresh force-fetches the cube's card list, bypassing any cache. Used to
	// snapshot the cube when a new draft is created.
	Refresh(cube string) (*Cube, error)
}

// LoadOptions selects which cube list to load from disk.
type LoadOptions struct {
	// DataRoot is the path to the repo's data directory.
	DataRoot string

	// Cube is the cube name, e.g. "polyverse".
	Cube string

	// DraftDir pins the cube list to the snapshot in that draft's directory;
	// empty means the latest snapshot.
	DraftDir string

	// Source, when set, supplies the live cube list to fall back on if no
	// snapshot exists on disk.
	Source CubeSource
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

	// A specific draft pins us to its snapshot, with no fallback.
	if opts.DraftDir != "" {
		c, err := LoadCube(filepath.Join(opts.DraftDir, "cube-snapshot.json"))
		if err == nil {
			return c, nil
		}
		if !os.IsNotExist(err) {
			return nil, err
		}
		return nil, fmt.Errorf("no snapshot for cube %q in %s", opts.Cube, opts.DraftDir)
	}

	// Otherwise prefer the most recent snapshot.
	path, ok, err := latestSnapshot(cubeDir)
	if err != nil {
		return nil, err
	}
	if ok {
		return LoadCube(path)
	}

	// No snapshot yet, so fall back to the live cube from CubeCobra.
	if opts.Source != nil {
		return opts.Source.Current(opts.Cube)
	}
	return nil, fmt.Errorf("no cube list found for %q", opts.Cube)
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

// draftDirName matches a draft directory: a zero-padded draft ID, then its date.
var draftDirName = regexp.MustCompile(`^\d{4,}_\d{4}-\d{2}-\d{2}$`)

// latestSnapshot returns the path to the cube-snapshot.json in the draft
// directory with the highest ID, or ok=false if no draft has one. IDs are
// assigned in order, so the highest is the most recently added draft.
func latestSnapshot(cubeDir string) (string, bool, error) {
	entries, err := os.ReadDir(cubeDir)
	if err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, err
	}
	best, bestID := "", 0
	for _, e := range entries {
		if !e.IsDir() || !draftDirName.MatchString(e.Name()) {
			continue
		}
		id, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		if err != nil || id <= bestID {
			continue
		}
		path := filepath.Join(cubeDir, e.Name(), "cube-snapshot.json")
		if _, err := os.Stat(path); err == nil {
			best, bestID = path, id
		}
	}
	return best, best != "", nil
}
