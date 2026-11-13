package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestColorIdentity_StringIsWUBRGOrder(t *testing.T) {
	assert.Equal(t, "WUBRG", NewColorIdentity("G", "R", "B", "U", "W").String())
	assert.Equal(t, "UG", NewColorIdentity("G", "U").String())
	assert.Equal(t, "", NewColorIdentity().String())
}

func TestNewColorIdentityFromString(t *testing.T) {
	assert.True(t, NewColorIdentityFromString("WU").Equals(NewColorIdentity("W", "U")))
	assert.False(t, NewColorIdentityFromString("WU").Equals(NewColorIdentity("W", "B")))
	assert.Empty(t, NewColorIdentityFromString(""))
}

func TestColorIdentity_Equals(t *testing.T) {
	assert.True(t, NewColorIdentity("R", "G").Equals(NewColorIdentity("G", "R")))
	assert.False(t, NewColorIdentity("R").Equals(NewColorIdentity("R", "G")), "a subset isn't equal")
	assert.False(t, NewColorIdentity("R", "G").Equals(NewColorIdentity("R")), "a superset isn't equal")
	assert.False(t, NewColorIdentity("R", "G").Equals(NewColorIdentity("R", "W")))
}

func TestColorIdentity_Contains(t *testing.T) {
	assert.True(t, NewColorIdentity("R").Contains("R"))
	assert.False(t, NewColorIdentity("R").Contains("G"))
}

func TestColorIdentity_SubsetsOfSize(t *testing.T) {
	wug := NewColorIdentity("W", "U", "G")

	pairs := wug.SubsetsOfSize(2)
	got := make([]string, 0, len(pairs))
	for _, pair := range pairs {
		got = append(got, pair.String())
	}
	assert.ElementsMatch(t, []string{"WU", "WG", "UG"}, got)

	assert.Len(t, wug.Subsets(), 7)
	assert.Empty(t, wug.SubsetsOfSize(0))
	assert.Empty(t, wug.SubsetsOfSize(4))
}
