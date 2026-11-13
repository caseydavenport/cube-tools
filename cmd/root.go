package cmd

import (
	"os"

	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/commands/edit"
)

var verbose bool

var rootCmd = &cobra.Command{
	Use:   "cube-tools",
	Short: "Parse and manage cube-tools data files.",
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		if verbose {
			logrus.SetLevel(logrus.DebugLevel)
		}
	},
}

// Execute runs the root command and exits with status 1 if it fails. main
// calls it once.
func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose logging")

	rootCmd.AddCommand(commands.ParseCmd)
	rootCmd.AddCommand(commands.ParseDirectoryCmd)
	rootCmd.AddCommand(commands.ReparseCmd)
	rootCmd.AddCommand(commands.DraftLogCmd)
	rootCmd.AddCommand(edit.EditRoot)
	rootCmd.AddCommand(commands.ManapoolCommand)
	rootCmd.AddCommand(commands.ImportHedronCmd)
	rootCmd.AddCommand(commands.ExportCCCmd)
	rootCmd.AddCommand(commands.PlayersCmd)
}
