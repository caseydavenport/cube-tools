package ocr

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSleevePaletteByName(t *testing.T) {
	require.Equal(t, SleevePalette{HueLo: 125, HueHi: 155, SatMin: 50, ValMin: 50}, SleevePaletteByName("purple"))
	require.Equal(t, defaultSleevePalette, SleevePaletteByName("orange"))
}

func TestSleevePaletteByName_FallsBackToDefault(t *testing.T) {
	require.Equal(t, defaultSleevePalette, SleevePaletteByName(""))
	require.Equal(t, defaultSleevePalette, SleevePaletteByName("chartreuse"))
	require.NotEqual(t, SleevePaletteByName("purple"), SleevePaletteByName("chartreuse"))
}
