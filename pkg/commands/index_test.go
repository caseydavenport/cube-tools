package commands

import (
	"testing"
)

func TestIndexMissingCubeReturnsError(t *testing.T) {
	// Point the working dir at a tree with no data/<cube> directory; Index
	// should return an error rather than exit the process.
	t.Chdir(t.TempDir())
	if err := Index("nope"); err == nil {
		t.Fatal("expected error when the drafts directory is missing")
	}
}
