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

// Link connects named groups under a single label, via one or more wires.
type Link struct {
	Label string `json:"label"`
	Wires []Wire `json:"wires"`
}

// DesignMapConfig is the persistent format stored in cube-rules.json.
type DesignMapConfig struct {
	Groups []Group `json:"groups"`
	Links  []Link  `json:"links"`
}
