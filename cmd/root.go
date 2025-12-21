package cmd

import (
	"os"

	"github.com/caseydavenport/cube-tools/pkg/commands"
	"github.com/caseydavenport/cube-tools/pkg/commands/edit"
	"github.com/spf13/cobra"
)

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "Parse and manage cube-tools data files.",
	Short: "Parse and manage cube-tools data files.",
	Long:  ``,
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
	rootCmd.AddCommand(commands.ParseCmd)
	rootCmd.AddCommand(commands.ParseDirectoryCmd)
	rootCmd.AddCommand(commands.ReparseCmd)
	rootCmd.AddCommand(commands.IndexCmd)
	rootCmd.AddCommand(commands.DraftLogCmd)
	rootCmd.AddCommand(edit.EditRoot)
	rootCmd.AddCommand(commands.DiffCubeCmd)
	rootCmd.AddCommand(commands.PrintCube)
	rootCmd.AddCommand(commands.ManapoolCommand)
}
