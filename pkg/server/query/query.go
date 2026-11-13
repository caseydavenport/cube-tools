// Package query reads typed values from a request's URL query string. An absent
// or unparsable value reads as the zero value, so a bad filter acts as no filter.
package query

import (
	"net/http"
	"strconv"

	"github.com/sirupsen/logrus"
)

// GetInt returns the integer query parameter name. It is 0 when the parameter
// is absent or isn't an integer, and the failed parse is logged.
func GetInt(r *http.Request, name string) int {
	s := r.URL.Query().Get(name)
	if s == "" {
		return 0
	}
	i, err := strconv.Atoi(s)
	if err != nil {
		logrus.WithError(err).Warn("failed to parse value")
	}
	return i
}

// GetString returns the query parameter name. It is "" when the parameter is
// absent, empty or the literal "null", which the UI sends for an unset filter.
func GetString(r *http.Request, name string) string {
	s := r.URL.Query().Get(name)
	if s == "" || s == "null" {
		return ""
	}
	return s
}

// GetFloat returns the floating-point query parameter name. It is 0 when the
// parameter is absent or isn't a number, and the failed parse is logged.
func GetFloat(r *http.Request, name string) float64 {
	s := r.URL.Query().Get(name)
	if s == "" {
		return 0
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		logrus.WithError(err).Warn("failed to parse value")
	}
	return v
}

// GetBool returns the boolean query parameter name, accepting what
// strconv.ParseBool does. It is false when the parameter is absent or isn't a
// boolean, and the failed parse is logged.
func GetBool(r *http.Request, name string) bool {
	s := r.URL.Query().Get(name)
	if s == "" {
		return false
	}
	b, err := strconv.ParseBool(s)
	if err != nil {
		logrus.WithError(err).Warn("failed to parse value")
	}
	return b
}
