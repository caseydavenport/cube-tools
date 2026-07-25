package cubes

import "strings"

// CubeCobraPrefix marks a cube id as a dynamically-loaded CubeCobra cube
// rather than a registry cube. The text after it is the CubeCobra cube id.
const CubeCobraPrefix = "cc:"

// IsCubeCobra reports whether a cube id addresses a CubeCobra cube.
func IsCubeCobra(id string) bool {
	return strings.HasPrefix(id, CubeCobraPrefix)
}

// CubeCobraID returns the CubeCobra cube id carried by a cc: cube id.
func CubeCobraID(id string) string {
	return strings.TrimPrefix(id, CubeCobraPrefix)
}

// ValidCubeCobraID reports whether ccid is a safe CubeCobra cube id: non-empty
// and limited to the characters CubeCobra uses for short ids and ObjectIds, so
// it can't escape a URL path or a cache key.
func ValidCubeCobraID(ccid string) bool {
	if ccid == "" {
		return false
	}
	for _, r := range ccid {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '-' || r == '_':
		default:
			return false
		}
	}
	return true
}
