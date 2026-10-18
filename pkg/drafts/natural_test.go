package drafts

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNaturalLess(t *testing.T) {
	tests := []naturalLessCase{
		{"p2", "p10", true},
		{"p10", "p2", false},
		{"photo9.jpg", "photo10.jpg", true},
		{"IMG_0012.jpg", "IMG_0013.jpg", true},
		{"a", "b", true},
		{"b", "a", false},
		{"p3", "p3", false},
		{"10.json", "9.json", false},
		{"9.json", "ozzy.json", true},
	}
	for _, tc := range tests {
		assert.Equal(t, tc.want, NaturalLess(tc.a, tc.b), "%s < %s", tc.a, tc.b)
	}
}

// naturalLessCase is one row of TestNaturalLess.
type naturalLessCase struct {
	a    string
	b    string
	want bool
}
