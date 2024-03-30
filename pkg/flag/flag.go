package flag

import (
	"fmt"
	"os"
	"strconv"

	"github.com/sirupsen/logrus"
	flag "github.com/spf13/pflag"
)

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
