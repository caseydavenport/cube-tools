package edit

import (
	"github.com/spf13/cobra"
)

// EditRoot groups the commands that change an existing draft's files.
var EditRoot = &cobra.Command{
	Use:   "edit",
	Short: "Edit an existing deck file",
}

func init() {
	EditRoot.AddCommand(AddMatchCmd)
}
