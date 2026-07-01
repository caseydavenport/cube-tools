package ocr

// SleevePalette is the HSV color band that isolates a cube's card sleeves from
// the rest of a photo. Different cubes use different sleeve colors, so the band
// is chosen per cube rather than hard-coded. Hue is on OpenCV's 0-179 scale
// (half the usual 0-360 degrees); SatMin/ValMin drop washed-out and shadowed
// pixels that share the hue but aren't sleeve.
type SleevePalette struct {
	HueLo  int
	HueHi  int
	SatMin int
	ValMin int
}

// sleevePalettes maps a cube's sleeve-color name to its band. Orange sleeves on
// a dark surface are the common case; purple is for cubes sleeved in violet.
var sleevePalettes = map[string]SleevePalette{
	"orange": {HueLo: 5, HueHi: 22, SatMin: 120, ValMin: 100},
	"purple": {HueLo: 125, HueHi: 155, SatMin: 50, ValMin: 50},
}

// DefaultSleevePalette is used when a cube doesn't name a sleeve color.
var DefaultSleevePalette = sleevePalettes["orange"]

// SleevePaletteByName returns the palette for a sleeve-color name, falling back
// to the default for an empty or unknown name.
func SleevePaletteByName(name string) SleevePalette {
	if p, ok := sleevePalettes[name]; ok {
		return p
	}
	return DefaultSleevePalette
}
