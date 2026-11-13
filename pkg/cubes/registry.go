package cubes

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

// Cube is one cube in the registry: its id, display name and the optional
// Cube Cobra and OCR settings that go with it.
type Cube struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`

	// CubeCobraID is the cube's shortId or UUID on Cube Cobra. When set, the
	// cube can be refreshed from its Cube Cobra list.
	CubeCobraID string `json:"cubecobra_id,omitempty"`

	// SleeveColor names the sleeve color the OCR photo scanner keys on for this
	// cube (e.g. "orange", "purple"). Empty means the default (orange).
	SleeveColor string `json:"sleeve_color,omitempty"`
}

// Registry is the list of cubes in cubes.json, in file order, with lookup by
// id.
type Registry struct {
	cubes []Cube
	index map[string]Cube
}

// fileFormat mirrors cubes.json.
type fileFormat struct {
	Cubes []Cube `json:"cubes"`
}

// Load reads a cube registry from path. It fails if the file can't be read or
// parsed, or if a cube has no id or repeats another's.
func Load(path string) (*Registry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read cube registry: %w", err)
	}
	var ff fileFormat
	if err := json.Unmarshal(data, &ff); err != nil {
		return nil, fmt.Errorf("parse cube registry: %w", err)
	}
	index := make(map[string]Cube, len(ff.Cubes))
	for _, c := range ff.Cubes {
		if c.ID == "" {
			return nil, errors.New("cube registry entry missing id")
		}
		if _, dup := index[c.ID]; dup {
			return nil, fmt.Errorf("duplicate cube id %q in registry", c.ID)
		}
		index[c.ID] = c
	}
	return &Registry{cubes: ff.Cubes, index: index}, nil
}

// List returns a copy of the cubes in file order.
func (r *Registry) List() []Cube {
	return append([]Cube(nil), r.cubes...)
}

// Has reports whether a cube with the id is registered.
func (r *Registry) Has(id string) bool {
	_, ok := r.index[id]
	return ok
}

// Get returns the cube with the id, and false when none is registered.
func (r *Registry) Get(id string) (Cube, bool) {
	c, ok := r.index[id]
	return c, ok
}
