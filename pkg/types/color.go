package types

import (
	"maps"
	"slices"
	"strings"

	"gonum.org/v1/gonum/stat/combin"
)

// colorOrder is the conventional order of the five colors, which Slice and
// String use so a color identity always reads the same way.
const colorOrder = "WUBRG"

// ColorIdentity represents a set of colors.
type ColorIdentity map[string]bool

// NewColorIdentity returns the set of the given color letters, such as "W".
func NewColorIdentity(colors ...string) ColorIdentity {
	ci := make(ColorIdentity)
	for _, c := range colors {
		ci[c] = true
	}
	return ci
}

// NewColorIdentityFromString returns the set of colors in a string of color
// letters such as "WU". Each character is one color.
func NewColorIdentityFromString(s string) ColorIdentity {
	ci := make(ColorIdentity)
	for _, c := range s {
		ci[string(c)] = true
	}
	return ci
}

// Equals reports whether both identities hold exactly the same colors.
func (ci ColorIdentity) Equals(other ColorIdentity) bool {
	if len(ci) != len(other) {
		return false
	}
	for color := range ci {
		if !other[color] {
			return false
		}
	}
	return true
}

// String returns the colors as letters in WUBRG order, such as "WUG".
func (ci ColorIdentity) String() string {
	return strings.Join(ci.Slice(), "")
}

// Contains reports whether the identity includes the color letter.
func (ci ColorIdentity) Contains(color string) bool {
	return ci[color]
}

// Slice returns the colors in WUBRG order.
func (ci ColorIdentity) Slice() []string {
	colors := slices.Collect(maps.Keys(ci))
	slices.SortFunc(colors, func(a, b string) int {
		return strings.Index(colorOrder, a) - strings.Index(colorOrder, b)
	})
	return colors
}

// Subsets returns all subsets of the color identity, including the full set.
// e.g., for WUG, it returns ["W", "U", "G", "WU", "WG", "UG", "WUG" ].
func (ci ColorIdentity) Subsets() []ColorIdentity {
	colors := ci.Slice()

	var subsets []ColorIdentity
	for k := 1; k <= len(colors); k++ {
		for _, indices := range combin.Combinations(len(colors), k) {
			subset := make(ColorIdentity)
			for _, i := range indices {
				subset[colors[i]] = true
			}
			subsets = append(subsets, subset)
		}
	}
	return subsets
}

// SubsetsOfSize returns the subsets of the identity that hold exactly size
// colors. A size of zero or beyond the identity's size gives none.
func (ci ColorIdentity) SubsetsOfSize(size int) []ColorIdentity {
	var result []ColorIdentity
	for _, subset := range ci.Subsets() {
		if len(subset) == size {
			result = append(result, subset)
		}
	}
	return result
}
