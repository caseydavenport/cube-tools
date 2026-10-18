package drafts

import "strings"

// NaturalLess orders strings so runs of digits compare as numbers: "p2" sorts
// before "p10" and "photo9.jpg" before "photo10.jpg". Everything else compares
// byte by byte.
func NaturalLess(a, b string) bool {
	for a != "" && b != "" {
		if isDigit(a[0]) && isDigit(b[0]) {
			na, restA := digitRun(a)
			nb, restB := digitRun(b)
			if na != nb {
				return numLess(na, nb)
			}
			a, b = restA, restB
			continue
		}
		if a[0] != b[0] {
			return a[0] < b[0]
		}
		a, b = a[1:], b[1:]
	}
	return len(a) < len(b)
}

// isDigit reports whether c is an ASCII digit.
func isDigit(c byte) bool {
	return c >= '0' && c <= '9'
}

// digitRun splits s into its leading digits, with leading zeros dropped, and
// the rest.
func digitRun(s string) (string, string) {
	i := 0
	for i < len(s) && isDigit(s[i]) {
		i++
	}
	return strings.TrimLeft(s[:i], "0"), s[i:]
}

// numLess compares two digit strings without leading zeros as numbers.
func numLess(a, b string) bool {
	if len(a) != len(b) {
		return len(a) < len(b)
	}
	return a < b
}
