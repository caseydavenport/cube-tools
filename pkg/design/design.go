package design

// Group defines a named set of cards selected by query conditions.
type Group struct {
	Name       string   `json:"name"`
	Conditions []string `json:"conditions"`

	// Exclude carves specific cards out of the condition matches by exact name,
	// so a query can stay broad without per-condition negations.
	Exclude []string `json:"exclude,omitempty"`
}

// Wire pairs source groups with target groups; cards from all source groups
// get edges to cards from all target groups. An entry prefixed "card:" names a
// single card directly instead of a group.
type Wire struct {
	Sources []string `json:"sources"`
	Targets []string `json:"targets"`
}

// Package is a named strategy: one or more wires that join groups of cards
// that work together.
type Package struct {
	Name  string `json:"name"`
	Wires []Wire `json:"wires"`
}

// DesignMapConfig is the persistent format stored in cube-rules.json.
type DesignMapConfig struct {
	Groups   []Group   `json:"groups"`
	Packages []Package `json:"packages"`
}
