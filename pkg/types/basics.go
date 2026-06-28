package types

// BasicLandNames lists the basic lands. They aren't part of any cube list - every
// deck supplies its own - so code that reasons about pools and decks treats them
// specially rather than looking them up in the cube.
var BasicLandNames = []string{
	"Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
	"Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
	"Snow-Covered Mountain", "Snow-Covered Forest", "Snow-Covered Wastes",
}

// IsBasic reports whether name is a basic land.
func IsBasic(name string) bool {
	for _, b := range BasicLandNames {
		if b == name {
			return true
		}
	}
	return false
}
