package cubes

import (
	"encoding/json"
	"fmt"
	"os"
)

type Cube struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`

	// CubeCobraID is the cube's shortId or UUID on Cube Cobra. When set, the
	// cube can be refreshed from its Cube Cobra list.
	CubeCobraID string `json:"cubecobra_id,omitempty"`
}

type Registry struct {
	cubes []Cube
	index map[string]Cube
}

type fileFormat struct {
	Cubes []Cube `json:"cubes"`
}

func Load(path string) (*Registry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read cube registry: %w", err)
	}
	var ff fileFormat
	if err := json.Unmarshal(data, &ff); err != nil {
		return nil, fmt.Errorf("parse cube registry: %w", err)
	}
	idx := make(map[string]Cube, len(ff.Cubes))
	for _, c := range ff.Cubes {
		if c.ID == "" {
			return nil, fmt.Errorf("cube registry entry missing id")
		}
		if _, dup := idx[c.ID]; dup {
			return nil, fmt.Errorf("duplicate cube id %q in registry", c.ID)
		}
		idx[c.ID] = c
	}
	return &Registry{cubes: ff.Cubes, index: idx}, nil
}

func (r *Registry) List() []Cube { return append([]Cube(nil), r.cubes...) }

func (r *Registry) Has(id string) bool { _, ok := r.index[id]; return ok }

func (r *Registry) Get(id string) (Cube, bool) { c, ok := r.index[id]; return c, ok }
