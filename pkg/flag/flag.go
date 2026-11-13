package flag

import (
	"fmt"
	"os"
	"strconv"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
	flag "github.com/spf13/pflag"
)

// StringVarP registers a string flag on flags. A non-empty env names an
// environment variable that, when set, overrides value as the default, and
// the usage text mentions it.
func StringVarP(flags *flag.FlagSet, p *string, name, shorthand, env, value string, usage string) {
	if env != "" {
		usage = fmt.Sprintf("%s (env %s)", usage, env)
	}
	flags.StringVarP(p, name, shorthand, value, usage)

	if env != "" {
		if val := os.Getenv(env); val != "" {
			*p = val
		}
	}
}

// BoolVarP registers a bool flag on flags. A non-empty env names an
// environment variable that, when set, overrides value as the default; a
// value that isn't a bool is fatal.
func BoolVarP(flags *flag.FlagSet, p *bool, name, shorthand, env string, value bool, usage string) {
	if env != "" {
		usage = fmt.Sprintf("%s (env %s)", usage, env)
	}
	flags.BoolVarP(p, name, shorthand, value, usage)

	if env != "" {
		if val := os.Getenv(env); val != "" {
			var err error
			*p, err = strconv.ParseBool(val)
			if err != nil {
				logrus.WithError(err).Fatalf("Failed to parse %s as bool", env)
			}
		}
	}
}

// MarkRequired makes each named flag of cmd required. A name cmd has no flag
// for is a programming error, so it is fatal.
func MarkRequired(cmd *cobra.Command, names ...string) {
	for _, name := range names {
		if err := cmd.MarkFlagRequired(name); err != nil {
			logrus.WithError(err).Fatalf("Failed to mark --%s required", name)
		}
	}
}
