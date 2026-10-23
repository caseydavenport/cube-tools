package types

import (
	"maps"
	"slices"
	"sort"
	"strings"

	"gonum.org/v1/gonum/stat/combin"
)

// ColorIdentity represents a set of colors.
type ColorIdentity map[string]bool

func NewColorIdentity(colors ...string) ColorIdentity {
	ci := make(ColorIdentity)
	for _, c := range colors {
		ci[c] = true
	}
	return ci
}

func NewColorIdentityFromString(s string) ColorIdentity {
	ci := make(ColorIdentity)
	for _, c := range s {
		ci[string(c)] = true
	}
	return ci
}

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

func (ci ColorIdentity) String() string {
	return strings.Join(ci.Slice(), "")
}

func (ci ColorIdentity) Contains(color string) bool {
	return ci[color]
}

func (ci ColorIdentity) Slice() []string {
	colors := slices.Collect(maps.Keys(ci))
	sort.Slice(colors, func(i, j int) bool {
		order := "WUBRG"
		return strings.Index(order, colors[i]) < strings.Index(order, colors[j])
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

func (ci ColorIdentity) SubsetsOfSize(size int) []ColorIdentity {
	var result []ColorIdentity
	for _, subset := range ci.Subsets() {
		if len(subset) == size {
			result = append(result, subset)
		}
	}
	return result
}
