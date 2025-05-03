package server

import (
	"net/http"
	"strconv"

	"github.com/sirupsen/logrus"
)

func getInt(r *http.Request, f string) int {
	s := r.URL.Query().Get(f)
	if s == "" {
		return 0
	}
	i, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		logrus.WithError(err).Warn("failed to parse value")
	}
	return int(i)
}

func getString(r *http.Request, f string) string {
	s := r.URL.Query().Get(f)
	if s == "" || s == "null" {
		return ""
	}
	return s
}
