package types

import (
	"encoding/json"
	"os"
)

func LoadCube(path string) (*Cube, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	c := &Cube{}
	if err := json.Unmarshal(contents, c); err != nil {
		return nil, err
	}
	return c, nil
}

type Cube struct {
	Cards []Card `json:"cards"`
}
