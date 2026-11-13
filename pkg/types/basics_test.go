package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsBasic(t *testing.T) {
	assert.True(t, IsBasic("Plains"))
	assert.True(t, IsBasic("Snow-Covered Forest"))
	assert.False(t, IsBasic("Steam Vents"), "a nonbasic land isn't basic")
	assert.False(t, IsBasic("plains"), "the match is case sensitive")
	assert.False(t, IsBasic(""))
}
