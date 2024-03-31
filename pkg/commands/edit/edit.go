package edit

import (
	"github.com/spf13/cobra"
)

var EditRoot = &cobra.Command{
	Use:   "edit",
	Short: "Edit an existing deck file",
}

// Add sub-commands to the root.
func init() {
	EditRoot.AddCommand(AddMatchCmd)
}
