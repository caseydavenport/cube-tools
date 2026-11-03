package design

// Group defines a named set of cards selected by query conditions.
type Group struct {
	Name       string   `json:"name"`
	Conditions []string `json:"conditions"`

	// Exclude carves specific cards out of the condition matches by exact name,
	// so a query can stay broad without per-condition negations.
	Exclude []string `json:"exclude,omitempty"`

	// Buildaround marks every card in the group as a build-around, for cards
	// like Collected Company that decks are built around but whose text
	// doesn't show it.
	Buildaround bool `json:"buildaround,omitempty"`

	// NotBuildaround keeps the group's cards from being build-arounds by
	// shape, for payoffs like a cheap delirium creature that one copy doesn't
	// make a deck about. A buildaround group or card: entry still marks them.
	NotBuildaround bool `json:"notBuildaround,omitempty"`
}

// The kinds of wire. On an Enables wire the sources are the enablers and the
// targets the payoffs; a Pairs with wire's sides go well together with
// neither feeding the other.
const (
	WireEnables = "enables"
	WirePairs   = "pairs"
)

// Wire pairs source groups with target groups; cards from all source groups
// get edges to cards from all target groups. An entry prefixed "card:" names a
// single card directly instead of a group. Kind is WireEnables or WirePairs;
// a missing kind reads as WirePairs.
type Wire struct {
	Kind    string   `json:"kind,omitempty"`
	Sources []string `json:"sources"`
	Targets []string `json:"targets"`
}

// IsEnables reports whether the wire's sources enable its targets.
func (w Wire) IsEnables() bool {
	return w.Kind == WireEnables
}

// KindOrPairs is the wire's kind, with a missing kind read as WirePairs.
func (w Wire) KindOrPairs() string {
	if w.IsEnables() {
		return WireEnables
	}
	return WirePairs
}

// Package is a named strategy: one or more wires that join groups of cards
// that work together.
type Package struct {
	Name  string `json:"name"`
	Wires []Wire `json:"wires"`
}

// PackageOverrides is a cube's choices about which packages it shows
// regardless of the relevance line: On always shows, Off always hides. Names
// match package names, ignoring case.
type PackageOverrides struct {
	On  []string `json:"on"`
	Off []string `json:"off"`
}

// DesignMapConfig is the persistent format stored in cube-rules.json.
type DesignMapConfig struct {
	Groups   []Group   `json:"groups"`
	Packages []Package `json:"packages"`
}
