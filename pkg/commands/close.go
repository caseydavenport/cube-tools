package commands

import (
	"io"

	"github.com/sirupsen/logrus"
)

// logClose closes c, logging a failure instead of returning it. It is for
// deferred closes of files and response bodies that were only read, where the
// caller has nothing to do about the error.
func logClose(c io.Closer, what string) {
	if err := c.Close(); err != nil {
		logrus.WithError(err).Warnf("Failed to close %s", what)
	}
}
