package types

import (
	"encoding/json"
	"fmt"
	"os"
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
