package cmd

import (
	"os"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/commands/edit"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var verbose bool

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "cube-tools",
	Short: "Parse and manage cube-tools data files.",
	Long:  ``,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		if verbose {
			logrus.SetLevel(logrus.DebugLevel)
		}
	},
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

// Add sub-commands to the root.
func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose logging")

	rootCmd.AddCommand(commands.ParseCmd)
	rootCmd.AddCommand(commands.ParseDirectoryCmd)
	rootCmd.AddCommand(commands.ReparseCmd)
	rootCmd.AddCommand(commands.IndexCmd)
	rootCmd.AddCommand(commands.DraftLogCmd)
	rootCmd.AddCommand(edit.EditRoot)
	rootCmd.AddCommand(commands.DiffCubeCmd)
	rootCmd.AddCommand(commands.PrintCube)
	rootCmd.AddCommand(commands.ManapoolCommand)
	rootCmd.AddCommand(commands.ImportHedronCmd)
	rootCmd.AddCommand(commands.ExportCCCmd)
}
