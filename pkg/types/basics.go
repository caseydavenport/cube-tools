package types

import "slices"

// BasicLandNames lists the basic lands. Cube lists leave them out because every
// deck supplies its own, so code that reasons about pools and decks handles
// them separately.
var BasicLandNames = []string{
	"Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
	"Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
	"Snow-Covered Mountain", "Snow-Covered Forest", "Snow-Covered Wastes",
}

// IsBasic reports whether name is a basic land.
func IsBasic(name string) bool {
	return slices.Contains(BasicLandNames, name)
}
